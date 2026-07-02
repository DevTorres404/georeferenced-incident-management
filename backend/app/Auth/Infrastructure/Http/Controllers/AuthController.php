<?php

namespace App\Auth\Infrastructure\Http\Controllers;

use App\Auth\Application\DTOs\CompleteProfileInputData;
use App\Auth\Application\DTOs\GoogleAuthInputData;
use App\Auth\Application\DTOs\LoginInputData;
use App\Auth\Application\DTOs\RegisterUserInputData;
use App\Auth\Application\DTOs\UpdateOwnProfileInputData;
use App\Auth\Application\DTOs\VerifyEmailInputData;
use App\Auth\Application\UseCases\CompleteProfileUseCase;
use App\Auth\Application\UseCases\GetAuthenticatedUserUseCase;
use App\Auth\Application\UseCases\GoogleRegistrationUseCase;
use App\Auth\Application\UseCases\LoginUseCase;
use App\Auth\Application\UseCases\LogoutUseCase;
use App\Auth\Application\UseCases\RegisterUserUseCase;
use App\Auth\Application\UseCases\ResendVerificationEmailUseCase;
use App\Auth\Application\UseCases\UpdateOwnProfileUseCase;
use App\Auth\Application\UseCases\VerifyEmailUseCase;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Infrastructure\Jobs\ProcessGoogleRegistration;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use Illuminate\Routing\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * @group Autenticación
 *
 * APIs para manejar el registro, inicio y cierre de sesión de usuarios.
 */
class AuthController extends Controller
{
    public function __construct(
        private LoginUseCase $loginUseCase,
        private RegisterUserUseCase $registerUserUseCase,
        private LogoutUseCase $logoutUseCase,
        private GetAuthenticatedUserUseCase $getAuthenticatedUserUseCase,
        private ResendVerificationEmailUseCase $resendVerificationEmailUseCase,
        private CompleteProfileUseCase $completeProfileUseCase,
        private UpdateOwnProfileUseCase $updateOwnProfileUseCase,
        private VerifyEmailUseCase $verifyEmailUseCase,
        private GoogleRegistrationUseCase $googleRegistrationUseCase,
        private AdminNotifier $adminNotifier
    ) {
    }

    /**
     * Iniciar sesión.
     *
     * Autentica al usuario usando email y contraseña, y devuelve un token de acceso.
     *
     * @unauthenticated
     * @bodyParam email string required El correo electrónico del usuario. Example: admin@torres404.com
     * @bodyParam password string required La contraseña del usuario. Example: password
     */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        try {
            return response()->json(
                $this->loginUseCase->execute(
                    new LoginInputData(
                        email: $credentials['email'],
                        password: $credentials['password'],
                        ip: (string) ($request->ip() ?? '127.0.0.1'),
                        userAgent: $request->userAgent()
                    )
                ),
                200
            );
        } catch (AuthException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode());
        }
    }

    /**
     * Registrar nuevo usuario.
     *
     * Crea una nueva cuenta de usuario en el sistema.
     *
     * @unauthenticated
     * @bodyParam first_name string required El nombre del usuario. Example: Juan
     * @bodyParam last_name string required El apellido del usuario. Example: Perez
     * @bodyParam username string required El nombre de usuario único. Example: juanperez
     * @bodyParam email string required El correo electrónico. Example: juan@example.com
     * @bodyParam password string required La contraseña (mínimo 8 caracteres). Example: password123
     * @bodyParam password_confirmation string required La confirmación de la contraseña. Example: password123
     * @bodyParam phone string El número de teléfono. Example: 0999999999
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['nullable', 'string', 'max:100'],
            'nombre' => ['nullable', 'string', 'max:100'],
            'apellido' => ['nullable', 'string', 'max:100'],
            'username' => [
                'required',
                'string',
                'min:3',
                'max:50',
                'regex:/^\S+$/u',
                Rule::unique(\App\Auth\Infrastructure\Persistence\Models\User::class, 'username'),
            ],
            'email' => ['required', 'email', 'max:255', Rule::unique(\App\Auth\Infrastructure\Persistence\Models\User::class, 'email')],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'phone' => ['nullable', 'string', 'max:20'],
        ], $this->validationMessages());

        $firstName = trim((string) ($data['first_name'] ?? $data['nombre'] ?? ''));
        $lastName = trim((string) ($data['last_name'] ?? $data['apellido'] ?? ''));

        if ($firstName === '' || $lastName === '') {
            return response()->json([
                'message' => 'Completa tu nombre y apellido.',
                'errors' => [
                    'first_name' => $firstName === '' ? ['Ingresa tu nombre.'] : [],
                    'last_name' => $lastName === '' ? ['Ingresa tu apellido.'] : [],
                ],
            ], 422);
        }

        $response = $this->registerUserUseCase->execute(
            new RegisterUserInputData(
                firstName: $firstName,
                lastName: $lastName,
                username: $data['username'],
                email: $data['email'],
                password: $data['password'],
                phone: $data['phone'] ?? null
            )
        );

        $this->adminNotifier->notify(
            title: 'Usuario creado',
            message: 'Se registró un nuevo usuario en el sistema.',
            type: 'STATUS_CHANGE'
        );

        return response()->json($response, 201);
    }

    /**
     * Iniciar sesión con Google.
     *
     * Permite autenticarse en el sistema utilizando un token de Google (Google Sign-In).
     *
     * @unauthenticated
     * @bodyParam id_token string required El token de identificación proporcionado por Google. Example: eyJhbGciOiJSUzI1NiIsImtp...
     * @bodyParam flow_id string ID de flujo para el registro en background. Example: 12345
     */
    public function google(Request $request): JsonResponse
    {
        $data = $request->validate([
            'intent' => ['required', 'string', 'in:login,register'],
            'id_token' => ['required', 'string'],
            'flow_id' => ['nullable', 'string', 'max:100'],
        ]);

        if (! empty($data['flow_id'])) {
            ProcessGoogleRegistration::dispatch(
                $data['intent'],
                $data['flow_id'],
                $data['id_token'],
                (string) ($request->ip() ?? '127.0.0.1'),
                $request->userAgent()
            );

            return response()->json([
                'message' => 'Estamos preparando tu acceso con Google.',
                'flow_id' => $data['flow_id'],
                'channel' => 'auth.google.' . $data['flow_id'],
                'status' => 'queued',
            ], 202);
        }

        try {
            $response = $this->googleRegistrationUseCase->execute(
                    new GoogleAuthInputData(
                        intent: $data['intent'],
                        idToken: $data['id_token'],
                        ip: (string) ($request->ip() ?? '127.0.0.1'),
                        userAgent: $request->userAgent()
                    )
                );

            if ($data['intent'] === 'register') {
                $this->adminNotifier->notify(
                    title: 'Usuario creado',
                    message: 'Se registró un nuevo usuario en el sistema.',
                    type: 'STATUS_CHANGE'
                );
            }

            return response()->json($response, 200);
        } catch (AuthException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode());
        }
    }

    /**
     * Cerrar sesión.
     *
     * Invalida el token de acceso actual del usuario.
     *
     * @authenticated
     */
    public function logout(Request $request): JsonResponse
    {
        $tokenId = $request->user()->currentAccessToken()?->id;

        if (! $tokenId) {
            return response()->json([
                'message' => 'Sesión no válida.',
            ], 401);
        }

        try {
            $this->logoutUseCase->execute($tokenId);
        } catch (AuthException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode());
        }

        return response()->json([
            'message' => 'Sesión cerrada correctamente.',
        ], 200);
    }

    /**
     * Obtener perfil del usuario actual.
     *
     * Devuelve la información del usuario autenticado actualmente.
     *
     * @authenticated
     */
    public function me(Request $request): JsonResponse
    {
        try {
            return response()->json([
                'user' => $this->getAuthenticatedUserUseCase->execute($request->user()->id),
            ], 200);
        } catch (AuthException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode());
        }
    }

    /**
     * Reenviar correo de verificación.
     *
     * Envía nuevamente el correo con el enlace para verificar la dirección de correo electrónico.
     *
     * @authenticated
     */
    public function resendVerificationEmail(Request $request): JsonResponse
    {
        try {
            $this->resendVerificationEmailUseCase->execute($request->user()->id);
        } catch (AuthException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode());
        }

        return response()->json([
            'message' => 'Correo de verificacion enviado.',
        ]);
    }

    /**
     * Completar perfil (Google).
     *
     * Permite establecer el nombre de usuario luego de registrarse mediante Google.
     *
     * @authenticated
     * @bodyParam username string required El nombre de usuario único. Example: marianop
     */
    public function completeProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => [
                'required',
                'string',
                'min:3',
                'max:50',
                'regex:/^\S+$/u',
                Rule::unique(\App\Auth\Infrastructure\Persistence\Models\User::class, 'username')->ignore($request->user()->id),
            ],
        ], $this->validationMessages());

        try {
            return response()->json(
                $this->completeProfileUseCase->execute(
                    new CompleteProfileInputData(
                        userId: (int) $request->user()->id,
                        username: $data['username']
                    )
                ),
                200
            );
        } catch (AuthException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode());
        }
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'username' => [
                'required',
                'string',
                'min:3',
                'max:50',
                'regex:/^\S+$/u',
                Rule::unique(\App\Auth\Infrastructure\Persistence\Models\User::class, 'username')->ignore($request->user()->id),
            ],
        ], $this->validationMessages());

        try {
            return response()->json(
                $this->updateOwnProfileUseCase->execute(
                    new UpdateOwnProfileInputData(
                        userId: (int) $request->user()->id,
                        firstName: $data['first_name'],
                        lastName: $data['last_name'],
                        username: $data['username']
                    )
                ),
                200
            );
        } catch (AuthException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode());
        }
    }

    /**
     * Verificar correo electrónico.
     *
     * Ruta para validar el hash enviado por correo electrónico.
     *
     * @unauthenticated
     * @urlParam id int required El ID del usuario. Example: 1
     * @urlParam hash string required El hash de verificación enviado al correo. Example: a1b2c3d4e5
     */
    public function verifyEmail(Request $request, int $id, string $hash): JsonResponse|\Illuminate\Http\RedirectResponse
    {
        try {
            $this->verifyEmailUseCase->execute(
                new VerifyEmailInputData(
                    userId: $id,
                    hash: $hash
                )
            );
        } catch (AuthException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode());
        }

        if (! $request->expectsJson()) {
            return redirect()->away(rtrim((string) env('FRONTEND_URL', 'http://localhost:5500'), '/') . '/?verified=1');
        }

        return response()->json([
            'message' => 'Correo verificado correctamente.',
        ]);
    }

    private function validationMessages(): array
    {
        return [
            'first_name.required' => 'Ingresa tu nombre.',
            'first_name.max' => 'El nombre no puede superar los 100 caracteres.',
            'last_name.required' => 'Ingresa tu apellido.',
            'last_name.max' => 'El apellido no puede superar los 100 caracteres.',
            'username.required' => 'Ingresa un nombre de usuario.',
            'username.min' => 'El nombre de usuario debe tener al menos 3 caracteres.',
            'username.max' => 'El nombre de usuario no puede superar los 50 caracteres.',
            'username.regex' => 'El nombre de usuario no puede contener espacios.',
            'username.unique' => 'Ese nombre de usuario ya esta en uso.',
            'email.required' => 'Ingresa tu correo electronico.',
            'email.email' => 'Ingresa un correo electronico valido.',
            'email.unique' => 'Ya existe una cuenta con ese correo electronico.',
            'password.required' => 'Ingresa una contrasena.',
            'password.min' => 'La contrasena debe tener al menos 8 caracteres.',
            'password.confirmed' => 'La confirmacion de la contrasena no coincide.',
        ];
    }
}
