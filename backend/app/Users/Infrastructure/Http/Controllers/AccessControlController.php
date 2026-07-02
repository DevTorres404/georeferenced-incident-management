<?php

namespace App\Users\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\Users\Application\UseCases\AccessControlUseCase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccessControlController extends ApiController
{
    public function __construct(
        private AccessControlUseCase $accessControlUseCase,
        private AdminNotifier $adminNotifier
    )
    {
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => $this->accessControlUseCase->overview(),
        ]);
    }

    public function syncRolePermissions(Request $request, int $role): JsonResponse
    {
        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', Rule::exists(\App\Auth\Infrastructure\Persistence\Models\Permission::class, 'code')],
        ]);

        $roleModel = Role::findOrFail($role);
        $roleData = $this->accessControlUseCase->syncRolePermissions($role, $data['permissions']);

        $this->adminNotifier->notify(
            title: 'Cambio de permisos',
            message: "Se modificaron permisos del rol {$roleModel->name}.",
            type: 'STATUS_CHANGE'
        );

        return response()->json([
            'message' => 'Permisos del rol actualizados correctamente.',
            'data' => $roleData,
        ]);
    }
}
