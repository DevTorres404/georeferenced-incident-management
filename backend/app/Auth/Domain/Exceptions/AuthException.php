<?php

namespace App\Auth\Domain\Exceptions;

use Exception;

class AuthException extends Exception
{
    public static function invalidCredentials(): self
    {
        return new self('Las credenciales proporcionadas son incorrectas.', 401);
    }

    public static function invalidCurrentPassword(): self
    {
        return new self('La contrasena actual no coincide.', 422);
    }

    public static function passwordUnchanged(): self
    {
        return new self('La nueva contrasena no puede ser igual a la actual.', 422);
    }

    public static function invalidPasswordResetCode(): self
    {
        return new self('El codigo de recuperacion es invalido o expiro.', 422);
    }

    public static function inactiveUser(): self
    {
        return new self('El usuario está inactivo. Contacte al administrador.', 403);
    }

    public static function googleTokenInvalid(): self
    {
        return new self('No se pudo verificar el acceso con Google.', 401);
    }

    public static function googleUidInvalid(): self
    {
        return new self('Google no devolvió un identificador válido.', 422);
    }

    public static function googleEmailInvalid(): self
    {
        return new self('Google no devolvió un correo válido.', 422);
    }

    public static function googleEmailNotVerified(): self
    {
        return new self('Tu correo de Google debe estar verificado.', 403);
    }

    public static function accountInactive(): self
    {
        return new self('La cuenta esta desactivada. Contacta al administrador.', 403);
    }

    public static function googleAlreadyLinked(): self
    {
        return new self('Esta cuenta de Google ya está vinculada a otro usuario.', 409);
    }

    public static function emailMustBeVerified(): self
    {
        return new self('Debes verificar tu correo electronico antes de iniciar sesion.', 403);
    }

    public static function invalidVerificationLink(): self
    {
        return new self('El enlace de verificacion no es valido.', 403);
    }

    public static function userNotFound(): self
    {
        return new self('Usuario no encontrado.', 404);
    }

    public static function userAlreadyExists(): self
    {
        return new self('Ya estás registrado. Por favor, inicia sesión.', 409);
    }
}
