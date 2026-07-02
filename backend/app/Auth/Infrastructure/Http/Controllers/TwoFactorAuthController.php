<?php

namespace App\Auth\Infrastructure\Http\Controllers;

use App\Auth\Application\UseCases\ConfirmTwoFactorUseCase;
use App\Auth\Application\UseCases\DisableTwoFactorUseCase;
use App\Auth\Application\UseCases\EnableTwoFactorUseCase;
use App\Auth\Application\UseCases\VerifyTwoFactorLoginUseCase;
use App\Auth\Domain\Exceptions\AuthException;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TwoFactorAuthController
{
    public function __construct(
        private EnableTwoFactorUseCase $enableTwoFactor,
        private ConfirmTwoFactorUseCase $confirmTwoFactor,
        private VerifyTwoFactorLoginUseCase $verifyLogin,
        private DisableTwoFactorUseCase $disableTwoFactor
    ) {
    }

    public function enable(Request $request): JsonResponse
    {
        try {
            $userId = $request->user()->id;
            $result = $this->enableTwoFactor->execute($userId);
        } catch (AuthException $exception) {
            return $this->authError($exception);
        } catch (DomainException $exception) {
            return $this->domainError($exception->getMessage());
        }

        return response()->json($result);
    }

    public function disable(Request $request): JsonResponse
    {
        try {
            $userId = $request->user()->id;
            $this->disableTwoFactor->execute($userId);
        } catch (AuthException $exception) {
            return $this->authError($exception);
        } catch (DomainException $exception) {
            return $this->domainError($exception->getMessage());
        }

        return response()->json([
            'message' => 'Autenticacion de dos factores deshabilitada con exito.',
        ]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'regex:/^[0-9]{6}$/'],
        ]);

        try {
            $userId = $request->user()->id;
            $this->confirmTwoFactor->execute($userId, $request->input('code'));
        } catch (AuthException $exception) {
            return $this->authError($exception);
        } catch (DomainException $exception) {
            return $this->domainError($exception->getMessage(), 'code');
        }

        return response()->json([
            'message' => 'Autenticacion de dos factores habilitada con exito.',
        ]);
    }

    public function verifyLogin(Request $request): JsonResponse
    {
        $request->validate([
            'two_factor_token' => ['required', 'string'],
            'code' => ['required', 'string', 'regex:/^[0-9]{6}$/'],
        ]);

        try {
            $result = $this->verifyLogin->execute(
                $request->input('two_factor_token'),
                $request->input('code')
            );
        } catch (AuthException $exception) {
            return $this->authError($exception);
        } catch (DomainException $exception) {
            return $this->domainError($exception->getMessage(), 'code');
        }

        return response()->json($result);
    }

    private function authError(AuthException $exception): JsonResponse
    {
        $status = $exception->getCode();
        $status = $status >= 400 && $status < 600 ? $status : 401;

        return response()->json([
            'message' => $exception->getMessage(),
        ], $status);
    }

    private function domainError(string $message, ?string $field = null): JsonResponse
    {
        $payload = [
            'message' => $message,
        ];

        if ($field !== null) {
            $payload['errors'] = [
                $field => [$message],
            ];
        }

        return response()->json($payload, 422);
    }
}
