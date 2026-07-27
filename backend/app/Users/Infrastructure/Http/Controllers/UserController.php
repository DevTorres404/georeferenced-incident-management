<?php

namespace App\Users\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\Shared\Infrastructure\Notifications\UserNotifier;
use App\Users\Application\DTOs\CreateManagedUserInputData;
use App\Users\Application\DTOs\SyncUserRolesInputData;
use App\Users\Application\DTOs\UpdateManagedUserInputData;
use App\Users\Application\DTOs\UserFiltersData;
use App\Users\Application\UseCases\UserManagementUseCase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * @group Usuarios
 *
 * APIs para la gestión de usuarios del sistema.
 */
class UserController extends ApiController
{
    public function __construct(
        private UserManagementUseCase $userManagementUseCase,
        private AdminNotifier $adminNotifier,
        private UserNotifier $userNotifier
    ) {}

    /**
     * Listar usuarios.
     *
     * Devuelve una lista paginada de usuarios, con opciones de filtrado.
     *
     * @authenticated
     *
     * @queryParam search string Búsqueda por nombre, apellido o correo. Example: admin
     * @queryParam role string Filtrar por código de rol. Example: ADMIN
     * @queryParam activo boolean Filtrar por estado activo/inactivo. Example: 1
     * @queryParam per_page int Cantidad de registros por página. Example: 15
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'role' => ['nullable', 'string', 'max:50'],
            'activo' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return response()->json($this->userManagementUseCase->paginate(
            new UserFiltersData(
                search: $filters['search'] ?? null,
                roleCode: $filters['role'] ?? null,
                isActive: $filters['activo'] ?? null,
                perPage: $filters['per_page'] ?? 15
            )
        ));
    }

    /**
     * Crear usuario.
     *
     * Permite a un administrador crear un nuevo usuario en el sistema.
     *
     * @authenticated
     *
     * @bodyParam nombre string required Nombre del usuario. Example: Carlos
     * @bodyParam apellido string required Apellido del usuario. Example: Gonzalez
     * @bodyParam username string Nombre de usuario (opcional). Example: cgonzalez
     * @bodyParam email string required Correo electrónico del usuario. Example: cgonzalez@example.com
     * @bodyParam password string required Contraseña (mínimo 8 caracteres). Example: password123
     * @bodyParam telefono string Número de teléfono. Example: 0987654321
     * @bodyParam foto_perfil string URL o nombre de archivo de la foto. Example: avatar.jpg
     * @bodyParam activo boolean Indica si el usuario está activo. Example: true
     * @bodyParam roles string[] Arreglo con códigos de roles. Example: ["ADMIN", "AGENTE"]
     */
    public function store(Request $request): JsonResponse
    {
        if (! $this->can($request->user(), 'users.create')) {
            return $this->forbid();
        }

        if ($request->has('username') && is_string($request->username)) {
            $request->merge(['username' => strtolower($request->username)]);
        }

        $data = $request->validate([
            'nombre' => ['nullable', 'string', 'max:100', 'regex:/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/u'],
            'apellido' => ['nullable', 'string', 'max:100', 'regex:/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/u'],
            'first_name' => ['nullable', 'string', 'max:100', 'regex:/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/u'],
            'last_name' => ['nullable', 'string', 'max:100', 'regex:/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/u'],
            'username' => ['nullable', 'string', 'min:3', 'max:50', 'regex:/^[a-z0-9_.-]+$/i', Rule::unique(User::class, 'username')],
            'email' => ['required', 'email', 'max:255', Rule::unique(User::class, 'email')],
            'password' => ['required', 'string', 'min:8'],
            'telefono' => ['nullable', 'string', 'max:20'],
            'phone' => ['nullable', 'string', 'max:20'],
            'foto_perfil' => ['nullable', 'string', 'max:255'],
            'profile_photo' => ['nullable', 'string', 'max:255'],
            'activo' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'roles' => ['sometimes', 'array', 'size:1'],
            'roles.*' => ['string', Rule::exists(Role::class, 'code')],
        ], $this->validationMessages());

        [$firstName, $lastName] = $this->resolveNames($data);

        $user = $this->userManagementUseCase->create(
            new CreateManagedUserInputData(
                firstName: $firstName,
                lastName: $lastName,
                username: $data['username'] ?? null,
                email: $data['email'],
                password: $data['password'],
                phone: $data['phone'] ?? $data['telefono'] ?? null,
                profilePhoto: $data['profile_photo'] ?? $data['foto_perfil'] ?? null,
                isActive: $data['is_active'] ?? $data['activo'] ?? true,
                roleCodes: $data['roles'] ?? ['CIUDADANO'],
                assignedBy: $request->user()->id
            )
        );

        $this->adminNotifier->notify(
            title: 'Usuario creado',
            message: 'Se registró un nuevo usuario en el sistema.',
            type: 'STATUS_CHANGE'
        );

        return response()->json([
            'message' => 'Usuario creado correctamente.',
            'data' => $user,
        ], 201);
    }

    /**
     * Ver usuario.
     *
     * Devuelve la información detallada de un usuario específico.
     *
     * @authenticated
     *
     * @urlParam user int required El ID del usuario. Example: 2
     */
    public function show(User $user): JsonResponse
    {
        return response()->json([
            'data' => $this->userManagementUseCase->show($user->id),
        ]);
    }

    /**
     * Actualizar usuario.
     *
     * Permite modificar los datos de un usuario existente.
     *
     * @authenticated
     *
     * @urlParam user int required El ID del usuario. Example: 2
     *
     * @bodyParam nombre string Nombre del usuario. Example: Carlos
     * @bodyParam apellido string Apellido del usuario. Example: Gonzalez
     * @bodyParam username string Nombre de usuario. Example: cgonzalez
     * @bodyParam email string Correo electrónico. Example: cgonzalez@example.com
     * @bodyParam password string Contraseña nueva. Example: nuevapassword
     * @bodyParam telefono string Número de teléfono. Example: 0987654321
     * @bodyParam foto_perfil string URL de la foto. Example: avatar2.jpg
     * @bodyParam activo boolean Estado activo. Example: true
     * @bodyParam roles string[] Arreglo con códigos de roles. Example: ["ADMIN"]
     */
    public function update(Request $request, User $user): JsonResponse
    {
        if (! $this->can($request->user(), 'users.edit')) {
            return $this->forbid();
        }

        if ($request->has('username') && is_string($request->username)) {
            $request->merge(['username' => strtolower($request->username)]);
        }

        $data = $request->validate([
            'nombre' => ['sometimes', 'nullable', 'string', 'max:100', 'regex:/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/u'],
            'apellido' => ['sometimes', 'nullable', 'string', 'max:100', 'regex:/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/u'],
            'first_name' => ['sometimes', 'nullable', 'string', 'max:100', 'regex:/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/u'],
            'last_name' => ['sometimes', 'nullable', 'string', 'max:100', 'regex:/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/u'],
            'username' => ['nullable', 'string', 'min:3', 'max:50', 'regex:/^[a-z0-9_.-]+$/i', Rule::unique(User::class, 'username')->ignore($user->id)],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique(User::class, 'email')->ignore($user->id)],
            'password' => ['sometimes', 'string', 'min:8'],
            'telefono' => ['sometimes', 'nullable', 'string', 'max:20'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:20'],
            'foto_perfil' => ['sometimes', 'nullable', 'string', 'max:255'],
            'profile_photo' => ['sometimes', 'nullable', 'string', 'max:255'],
            'activo' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'roles' => ['sometimes', 'array', 'size:1'],
            'roles.*' => ['string', Rule::exists(Role::class, 'code')],
        ], $this->validationMessages());

        $previousRole = isset($data['roles']) ? $user->roles()->first() : null;

        $user = $this->userManagementUseCase->update(
            $user->id,
            new UpdateManagedUserInputData(
                firstName: isset($data['first_name']) || isset($data['nombre']) ? mb_convert_case(trim($data['first_name'] ?? $data['nombre']), MB_CASE_TITLE, 'UTF-8') : null,
                lastName: isset($data['last_name']) || isset($data['apellido']) ? mb_convert_case(trim($data['last_name'] ?? $data['apellido']), MB_CASE_TITLE, 'UTF-8') : null,
                username: array_key_exists('username', $data) ? $data['username'] : null,
                email: $data['email'] ?? null,
                password: $data['password'] ?? null,
                phone: array_key_exists('phone', $data) ? $data['phone'] : ($data['telefono'] ?? null),
                profilePhoto: array_key_exists('profile_photo', $data) ? $data['profile_photo'] : ($data['foto_perfil'] ?? null),
                isActive: $data['is_active'] ?? ($data['activo'] ?? null),
                roleCodes: $data['roles'] ?? null,
                assignedBy: $request->user()->id
            )
        );

        if (isset($data['roles'][0])) {
            $newRole = Role::where('code', $data['roles'][0])->first();
            $userName = trim("{$user->firstName} {$user->lastName}") ?: $user->email;

            $this->userNotifier->notify(
                userId: (int) $user->id,
                title: 'Tu rol fue actualizado',
                message: "Tu acceso ahora corresponde al rol {$this->roleLabel($newRole)}. Actualiza la pagina para aplicar el nuevo menu y permisos.",
                type: 'STATUS_CHANGE'
            );
            $this->adminNotifier->notify(
                title: 'Cambio de rol',
                message: "El usuario {$userName} cambio de {$this->roleLabel($previousRole)} a {$this->roleLabel($newRole)}.",
                type: 'STATUS_CHANGE'
            );
        }

        return response()->json([
            'message' => 'Usuario actualizado correctamente.',
            'data' => $user,
        ]);
    }

    /**
     * Eliminar usuario.
     *
     * Elimina lógicamente a un usuario del sistema (Soft Delete).
     *
     * @authenticated
     *
     * @urlParam user int required El ID del usuario a eliminar. Example: 3
     */
    public function destroy(Request $request, User $user): JsonResponse
    {
        if (! $this->can($request->user(), 'users.delete')) {
            return $this->forbid();
        }

        $this->userManagementUseCase->delete($user->id);

        return response()->json([
            'message' => 'Usuario eliminado correctamente.',
        ]);
    }

    /**
     * Sincronizar roles de usuario.
     *
     * Asigna el rol unico del usuario, eliminando cualquier rol anterior.
     *
     * @authenticated
     *
     * @urlParam user int required El ID del usuario. Example: 2
     *
     * @bodyParam roles string[] required Arreglo con los códigos de roles. Example: ["SUPERVISOR"]
     */
    public function syncUserRoles(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'roles' => ['required', 'array', 'size:1'],
            'roles.*' => ['string', Rule::exists(Role::class, 'code')],
        ]);

        $previousRole = $user->roles()->first();

        $user = $this->userManagementUseCase->syncRoles(
            new SyncUserRolesInputData(
                userId: $user->id,
                roleCodes: $data['roles'],
                assignedBy: $request->user()->id
            )
        );

        $newRole = Role::where('code', $data['roles'][0])->first();
        $this->userNotifier->notify(
            userId: (int) $user->id,
            title: 'Tu rol fue actualizado',
            message: "Tu acceso ahora corresponde al rol {$this->roleLabel($newRole)}. Actualiza la pagina para aplicar el nuevo menu y permisos.",
            type: 'STATUS_CHANGE'
        );
        $userName = trim("{$user->firstName} {$user->lastName}") ?: $user->email;
        $this->adminNotifier->notify(
            title: 'Cambio de rol',
            message: "El usuario {$userName} cambió de {$this->roleLabel($previousRole)} a {$this->roleLabel($newRole)}.",
            type: 'STATUS_CHANGE'
        );

        return response()->json([
            'message' => 'Roles actualizados correctamente.',
            'data' => $user,
        ]);
    }

    public function resetTwoFactor(Request $request, User $user): JsonResponse
    {
        if (! $request->user()?->tieneRol('ADMIN')) {
            return $this->forbid();
        }

        if ((int) $request->user()->id === (int) $user->id) {
            return response()->json([
                'message' => 'No puedes restablecer tu propia doble autenticacion desde esta pantalla.',
            ], 422);
        }

        $managedUser = $this->userManagementUseCase->resetTwoFactor(
            (int) $user->id,
            (int) $request->user()->id
        );

        $this->userNotifier->notify(
            userId: (int) $user->id,
            title: 'Doble autenticacion restablecida',
            message: 'Un administrador restablecio tu doble autenticacion. Inicia sesion y configurala nuevamente desde tu perfil.',
            type: 'STATUS_CHANGE'
        );

        return response()->json([
            'message' => 'Doble autenticacion restablecida correctamente.',
            'data' => $managedUser,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: string, 1: string}
     */
    private function resolveNames(array $data): array
    {
        $firstName = mb_convert_case(trim((string) ($data['first_name'] ?? $data['nombre'] ?? '')), MB_CASE_TITLE, 'UTF-8');
        $lastName = mb_convert_case(trim((string) ($data['last_name'] ?? $data['apellido'] ?? '')), MB_CASE_TITLE, 'UTF-8');

        abort_if($firstName === '' || $lastName === '', 422, 'Nombre y apellido son requeridos.');

        return [$firstName, $lastName];
    }

    private function validationMessages(): array
    {
        return [
            'username.min' => 'El nombre de usuario debe tener al menos 3 caracteres.',
            'username.max' => 'El nombre de usuario no puede superar los 50 caracteres.',
            'username.regex' => 'El nombre de usuario no puede contener espacios.',
            'username.unique' => 'Ese nombre de usuario ya esta en uso.',
            'email.required' => 'Ingresa un correo electronico.',
            'email.email' => 'Ingresa un correo electronico valido.',
            'email.unique' => 'Ya existe una cuenta con ese correo electronico.',
            'password.required' => 'Ingresa una contrasena.',
            'password.min' => 'La contrasena debe tener al menos 8 caracteres.',
            'nombre.regex' => 'Ingresa solo un nombre (sin espacios).',
            'apellido.regex' => 'Ingresa solo un apellido (sin espacios).',
            'first_name.regex' => 'Ingresa solo un nombre (sin espacios).',
            'last_name.regex' => 'Ingresa solo un apellido (sin espacios).',
        ];
    }

    private function roleLabel(?Role $role): string
    {
        return $role?->name ?: $role?->code ?: 'Sin rol';
    }
}
