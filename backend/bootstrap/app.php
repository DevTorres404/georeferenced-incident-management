<?php

use Illuminate\Foundation\Application;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Exceptions\InvalidSignatureException;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        ['middleware' => ['api', 'auth:sanctum']]
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'permission' => \App\Shared\Infrastructure\Http\Middleware\EnsureUserHasPermission::class,
            '2fa.admin' => \App\Http\Middleware\EnsureTwoFactorEnabledIfAdmin::class,
        ]);

        $middleware->redirectGuestsTo(null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        $exceptions->render(function (AuthenticationException $exception, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'No autenticado.'], 401);
            }
        });

        $exceptions->render(function (ThrottleRequestsException $exception, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'message' => 'Has realizado demasiadas solicitudes. Intenta nuevamente más tarde.',
                    'code' => 'RATE_LIMIT_EXCEEDED'
                ], 429);
            }
        });

        $exceptions->render(function (InvalidSignatureException $exception, Request $request) {
            $frontendUrl = rtrim((string) env('FRONTEND_URL', 'http://localhost:5500'), '/');

            if ($request->expectsJson()) {
                return response()->json([
                    'message' => 'El enlace de verificación ha expirado o no es válido. Solicita un nuevo enlace.',
                    'code' => 'INVALID_VERIFICATION_LINK',
                ], 403);
            }

            return redirect()->away($frontendUrl.'/?verified=0&error=invalid_link');
        });
    })->create();
