<?php

namespace App\Auth\Infrastructure\Http\Controllers;

use App\Auth\Application\UseCases\ConfirmTwoFactorUseCase;
use App\Auth\Application\UseCases\DisableTwoFactorUseCase;
use App\Auth\Application\UseCases\EnableTwoFactorUseCase;
use App\Auth\Application\UseCases\VerifyTwoFactorLoginUseCase;
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
        $userId = $request->user()->id;
        $result = $this->enableTwoFactor->execute($userId);

        return response()->json($result);
    }

    public function disable(Request $request): JsonResponse
    {
        $userId = $request->user()->id;
        $this->disableTwoFactor->execute($userId);

        return response()->json([
            'message' => 'Autenticación de dos factores deshabilitada con éxito.',
        ]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $request->validate([
            'code' => 'required|string',
        ]);

        $userId = $request->user()->id;
        $this->confirmTwoFactor->execute($userId, $request->input('code'));

        return response()->json([
            'message' => 'Autenticación de dos factores habilitada con éxito.',
        ]);
    }

    public function verifyLogin(Request $request): JsonResponse
    {
        $request->validate([
            'two_factor_token' => 'required|string',
            'code' => 'required|string',
        ]);

        $result = $this->verifyLogin->execute(
            $request->input('two_factor_token'),
            $request->input('code')
        );

        return response()->json($result);
    }
}
