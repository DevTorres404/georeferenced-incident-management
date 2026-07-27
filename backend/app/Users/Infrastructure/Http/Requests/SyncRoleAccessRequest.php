<?php

declare(strict_types=1);

namespace App\Users\Infrastructure\Http\Requests;

use App\Auth\Infrastructure\Persistence\Models\NavigationItem;
use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Users\Application\DTOs\SyncRoleAccessInputData;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class SyncRoleAccessRequest extends FormRequest
{
    private const ADMIN_CONTROL_PERMISSION = 'users.manage_roles';

    private const ADMIN_CONTROL_SCREEN = 'role-permissions';

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::exists(Permission::class, 'code')],
            'navigation_items' => ['present', 'array'],
            'navigation_items.*' => [
                'string',
                'distinct',
                Rule::exists(NavigationItem::class, 'code')
                    ->where(fn ($query) => $query->where('active', true)->whereNotNull('route')),
            ],
        ];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $permissionCodes = collect($this->input('permissions', []))
                    ->filter(fn (mixed $code): bool => is_string($code))
                    ->values();
                $navigationCodes = collect($this->input('navigation_items', []))
                    ->filter(fn (mixed $code): bool => is_string($code))
                    ->values();

                $navigationItems = NavigationItem::query()
                    ->whereIn('code', $navigationCodes)
                    ->whereNotNull('permission_code')
                    ->get(['code', 'label', 'permission_code']);
                $permissionNames = Permission::query()
                    ->whereIn('code', $navigationItems->pluck('permission_code'))
                    ->pluck('name', 'code');

                $navigationItems
                    ->each(function (NavigationItem $item) use (
                        $permissionCodes,
                        $permissionNames,
                        $validator
                    ): void {
                        if ($permissionCodes->contains($item->permission_code)) {
                            return;
                        }

                        $permissionName = $permissionNames->get(
                            $item->permission_code,
                            $item->permission_code
                        );
                        $validator->errors()->add(
                            'navigation_items',
                            "La pantalla {$item->label} requiere el permiso {$permissionName}."
                        );
                    });

                $role = Role::find($this->route('role'));
                if ($role?->code !== 'ADMIN') {
                    return;
                }

                if (! in_array(self::ADMIN_CONTROL_PERMISSION, $this->input('permissions', []), true)) {
                    $validator->errors()->add(
                        'permissions',
                        'El rol Administrador debe conservar el permiso para gestionar roles y permisos.'
                    );
                }

                if (! in_array(self::ADMIN_CONTROL_SCREEN, $this->input('navigation_items', []), true)) {
                    $validator->errors()->add(
                        'navigation_items',
                        'El rol Administrador debe conservar la pantalla Roles y permisos.'
                    );
                }
            },
        ];
    }

    public function toData(int $roleId): SyncRoleAccessInputData
    {
        $validated = $this->validated();

        return new SyncRoleAccessInputData(
            roleId: $roleId,
            permissionCodes: array_values($validated['permissions']),
            navigationItemCodes: array_values($validated['navigation_items'])
        );
    }
}
