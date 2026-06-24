<?php

namespace App\Users\Infrastructure\Http\Controllers;

use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\Users\Application\UseCases\AccessControlUseCase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccessControlController extends ApiController
{
    public function __construct(private AccessControlUseCase $accessControlUseCase)
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

        $roleData = $this->accessControlUseCase->syncRolePermissions($role, $data['permissions']);

        return response()->json([
            'message' => 'Permisos del rol actualizados correctamente.',
            'data' => $roleData,
        ]);
    }
}
