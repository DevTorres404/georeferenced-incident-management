<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\AuthActionResultData;
use App\Auth\Application\DTOs\CreateUserInputData;
use App\Auth\Application\DTOs\GoogleAuthInputData;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\LoginAttemptRepositoryInterface;
use App\Auth\Domain\Repositories\UserRepositoryInterface;
use App\Auth\Domain\Services\GoogleTokenVerifierInterface;
use App\Shared\Application\Ports\LoggerPort;
use Throwable;

final class GoogleRegistrationUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private LoginAttemptRepositoryInterface $attemptRepository,
        private GoogleTokenVerifierInterface $googleTokenVerifier,
        private SessionManagerPort $sessionManager,
        private UserNotificationPort $notificationPort,
        private LoggerPort $logger
    ) {
    }

    public function execute(GoogleAuthInputData $input): AuthActionResultData
    {
        try {
            $payload = $this->googleTokenVerifier->verify($input->idToken);
        } catch (Throwable $e) {
            $this->logger->error('Firebase verification failed', ['error' => $e->getMessage()]);
            $this->registrarIntentoGoogle(null, false, 'google_token_invalido', $input);

            throw AuthException::googleTokenInvalid();
        }

        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $firebaseUid = trim((string) ($payload['sub'] ?? ''));

        if ($firebaseUid === '') {
            $this->registrarIntentoGoogle($email ?: null, false, 'google_uid_invalido', $input);
            throw AuthException::googleUidInvalid();
        }

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->registrarIntentoGoogle(null, false, 'google_email_invalido', $input);
            throw AuthException::googleEmailInvalid();
        }

        if (! filter_var($payload['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $this->registrarIntentoGoogle($email, false, 'google_email_no_verificado', $input);
            throw AuthException::googleEmailNotVerified();
        }

        $existingIdentity = $this->userRepository->findIdentityByProvider('google', $firebaseUid);
        $user = $existingIdentity?->userId
            ? $this->userRepository->loadProfile($existingIdentity->userId)
            : $this->userRepository->findByEmail($email);

        if ($user && $input->intent === 'register') {
            $this->registrarIntentoGoogle($email, false, 'usuario_ya_existe', $input, $user->id);
            throw AuthException::userAlreadyExists();
        }

        if (! $user) {
            if ($input->intent === 'login') {
                $this->registrarIntentoGoogle($email, false, 'usuario_no_encontrado', $input);
                throw AuthException::userNotFound();
            }
            [$firstName, $lastName] = $this->resolverNombreGoogle($payload);
            $user = $this->userRepository->create(new CreateUserInputData(
                firstName: $firstName,
                lastName: $lastName,
                username: null,
                email: $email,
                password: bin2hex(random_bytes(32)),
                phone: null,
                profilePhoto: $payload['picture'] ?? null,
                emailVerifiedAt: now()->toIso8601String(),
                isActive: true
            ));

            $this->userRepository->assignRoleByCode($user->id, 'CIUDADANO');
            $this->sendWelcomeEmail($user->id, $user->email);
        } elseif (! $user->isActive) {
            $this->registrarIntentoGoogle($email, false, 'cuenta_inactiva', $input, $user->id);
            throw AuthException::accountInactive();
        }

        if (! $user->isActive) {
            $this->registrarIntentoGoogle($user->email, false, 'cuenta_inactiva', $input, $user->id);
            throw AuthException::accountInactive();
        }

        if ($user->isGoogleLinkedToAnotherUser($existingIdentity)) {
            throw AuthException::googleAlreadyLinked();
        }

        $this->userRepository->assignRoleByCode($user->id, 'CIUDADANO');
        $this->userRepository->syncIdentity(
            $user->id,
            'google',
            $firebaseUid,
            $email,
            [
                'name' => $payload['name'] ?? null,
                'given_name' => $payload['given_name'] ?? null,
                'family_name' => $payload['family_name'] ?? null,
                'picture' => $payload['picture'] ?? null,
                'email_verified' => true,
            ],
            now()->toIso8601String()
        );

        if (! $user->hasVerifiedEmail()) {
            $this->userRepository->markEmailAsVerified($user->id);
        }

        $this->userRepository->updateLastAccess($user->id);
        $this->registrarIntentoGoogle($user->email, true, null, $input, $user->id);

        if ($user->isTwoFactorEnabled()) {
            $twoFactorToken = $this->sessionManager->createTwoFactorToken($user->id);
            return new AuthActionResultData(
                message: 'Se requiere verificación de dos factores.',
                user: null,
                session: null,
                emailVerified: true,
                requires2fa: true,
                twoFactorToken: $twoFactorToken
            );
        }

        $session = $this->sessionManager->createForUser($user->id, 'google-api-token');
        $profile = $this->userRepository->loadProfile($user->id);

        if (! $profile) {
            throw AuthException::userNotFound();
        }

        return new AuthActionResultData(
            message: 'Inicio de sesion con Google exitoso.',
            user: $profile,
            session: $session,
            emailVerified: true
        );
    }

    private function resolverNombreGoogle(array $payload): array
    {
        $givenName = trim((string) ($payload['given_name'] ?? ''));
        $familyName = trim((string) ($payload['family_name'] ?? ''));

        if ($givenName !== '') {
            return [$givenName, $familyName];
        }

        $name = trim((string) ($payload['name'] ?? 'Usuario'));
        $parts = preg_split('/\s+/', $name, 2);

        return [$parts[0] ?? 'Usuario', $parts[1] ?? ''];
    }

    private function sendWelcomeEmail(int $userId, string $email): void
    {
        try {
            $this->notificationPort->sendWelcomeEmail($userId);
        } catch (Throwable $e) {
            $this->logger->error('No se pudo enviar correo de bienvenida.', [
                'user_id' => $userId,
                'email' => $email,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function registrarIntentoGoogle(
        ?string $email,
        bool $isSuccess,
        ?string $failureReason,
        GoogleAuthInputData $input,
        ?int $userId = null
    ): void {
        $this->attemptRepository->logAttempt(
            $email ?? 'google_login',
            $userId,
            $isSuccess,
            $failureReason,
            $input->ip,
            $input->userAgent
        );
    }
}
