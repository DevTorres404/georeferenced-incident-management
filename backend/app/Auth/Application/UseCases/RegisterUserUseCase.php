<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\DTOs\AuthActionResultData;
use App\Auth\Application\DTOs\CreateUserInputData;
use App\Auth\Application\DTOs\RegisterUserInputData;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Domain\Repositories\UserRepositoryInterface;
use App\Shared\Application\Ports\LoggerPort;
use Throwable;

final class RegisterUserUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private SessionManagerPort $sessionManager,
        private UserNotificationPort $notificationPort,
        private LoggerPort $logger
    ) {}

    public function execute(RegisterUserInputData $input): AuthActionResultData
    {
        $user = $this->userRepository->create(new CreateUserInputData(
            firstName: trim($input->firstName),
            lastName: trim($input->lastName),
            username: trim($input->username),
            email: strtolower(trim($input->email)),
            password: $input->password,
            phone: $input->phone,
            profilePhoto: null,
            emailVerifiedAt: null,
            isActive: true
        ));

        $this->userRepository->assignRoleByCode($user->id, 'CIUDADANO');
        $this->userRepository->syncIdentity(
            $user->id,
            'local',
            strtolower($user->email),
            $user->email,
            ['source' => 'registration']
        );

        $verification = $this->sendVerificationEmailSafely($user->id, $user->email);

        return new AuthActionResultData(
            message: 'Cuenta creada. Revisa tu correo para verificar tu cuenta antes de iniciar sesion.',
            user: null,
            session: null,
            verificationSent: $verification['sent'],
            verificationError: $verification['error']
        );
    }

    private function sendVerificationEmailSafely(int $userId, string $email): array
    {
        try {
            $this->notificationPort->sendVerificationEmailImmediately($userId);

            return [
                'sent' => true,
                'error' => null,
            ];
        } catch (Throwable $e) {
            $this->logger->error('No se pudo enviar correo de verificacion.', [
                'user_id' => $userId,
                'email' => $email,
                'error' => $e->getMessage(),
            ]);

            return [
                'sent' => false,
                'error' => 'No se pudo enviar el correo de verificacion.',
            ];
        }
    }
}
