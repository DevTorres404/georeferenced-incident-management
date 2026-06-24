<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTwoFactorEnabledIfAdmin
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->roles->contains('code', 'ADMIN')) {
            if (empty($user->two_factor_confirmed_at)) {
                return response()->json([
                    'message' => 'Los administradores deben configurar la autenticación de dos factores.',
                    'requires_2fa_setup' => true
                ], 403);
            }
        }

        return $next($request);
    }
}
