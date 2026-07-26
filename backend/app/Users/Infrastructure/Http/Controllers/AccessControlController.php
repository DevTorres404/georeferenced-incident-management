<?php

namespace App\Users\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\Shared\Infrastructure\Notifications\UserNotifier;
use App\Users\Application\UseCases\AccessControlUseCase;
use App\Users\Infrastructure\Http\Requests\SyncRoleAccessRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccessControlController extends ApiController
{
    public function __construct(
        private AccessControlUseCase $accessControlUseCase,
        private AdminNotifier $adminNotifier,
        private UserNotifier $userNotifier
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => $this->accessControlUseCase->overview(),
        ]);
    }

    public function navigation(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->accessControlUseCase->navigationForUser((int) $request->user()->id),
        ]);
    }

    public function syncRolePermissions(Request $request, int $role): JsonResponse
    {
        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', Rule::exists(Permission::class, 'code')],
        ]);

        $roleModel = Role::findOrFail($role);
        $affectedUserIds = $roleModel->users()
            ->where('is_active', true)
            ->get()
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $roleData = $this->accessControlUseCase->syncRolePermissions($role, $data['permissions']);

        $this->adminNotifier->notify(
            title: 'Cambio de permisos',
            message: "Se modificaron permisos del rol {$roleModel->name}.",
            type: 'STATUS_CHANGE'
        );
        $this->userNotifier->notifyMany(
            $affectedUserIds,
            'Permisos actualizados',
            "Los permisos del rol {$roleModel->name} fueron actualizados. Recarga la pagina para aplicar el nuevo menu.",
            'STATUS_CHANGE'
        );

        return response()->json([
            'message' => 'Permisos del rol actualizados correctamente.',
            'data' => $roleData,
        ]);
    }

    public function syncRoleAccess(SyncRoleAccessRequest $request, int $role): JsonResponse
    {
        $roleModel = Role::findOrFail($role);
        $affectedUserIds = $roleModel->users()
            ->where('is_active', true)
            ->get()
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $accessData = $this->accessControlUseCase->syncRoleAccess($request->toData($role));

        $this->adminNotifier->notify(
            title: 'Cambio de accesos',
            message: "Se modificaron los permisos y pantallas del rol {$roleModel->name}.",
            type: 'STATUS_CHANGE'
        );
        $this->userNotifier->notifyMany(
            $affectedUserIds,
            'Accesos actualizados',
            "Los permisos y pantallas del rol {$roleModel->name} fueron actualizados. Recarga la pagina para aplicar los cambios.",
            'STATUS_CHANGE'
        );

        return response()->json([
            'message' => 'Accesos del rol actualizados correctamente.',
            'data' => $accessData,
        ]);
    }
}
