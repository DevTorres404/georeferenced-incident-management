<?php

namespace App\Providers;

use App\Audit\Domain\Repositories\AuditRepositoryInterface;
use App\Audit\Infrastructure\Persistence\Repositories\EloquentAuditRepository;
use App\Auth\Application\Ports\PasswordHasherPort;
use App\Auth\Application\Ports\ProfilePhotoStoragePort;
use App\Auth\Application\Ports\SessionManagerPort;
use App\Auth\Application\Ports\TwoFactorAuthPort;
use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Domain\Repositories\LoginAttemptRepositoryInterface;
use App\Auth\Domain\Repositories\PasswordResetCodeRepositoryInterface;
use App\Auth\Domain\Repositories\UserRepositoryInterface;
use App\Auth\Domain\Services\GoogleTokenVerifierInterface;
use App\Auth\Infrastructure\Persistence\Models\PersonalAccessToken;
use App\Auth\Infrastructure\Repositories\EloquentLoginAttemptRepository;
use App\Auth\Infrastructure\Repositories\EloquentPasswordResetCodeRepository;
use App\Auth\Infrastructure\Repositories\EloquentUserRepository;
use App\Auth\Infrastructure\Services\FirebaseGoogleTokenVerifier;
use App\Auth\Infrastructure\Services\GoogleTwoFactorAuthAdapter;
use App\Auth\Infrastructure\Services\LaravelPasswordHasherAdapter;
use App\Auth\Infrastructure\Services\LaravelSessionManagerAdapter;
use App\Auth\Infrastructure\Services\LaravelUserNotificationAdapter;
use App\Auth\Infrastructure\Storage\RustFsProfilePhotoStorageAdapter;
use App\Catalogs\Domain\Repositories\CatalogRepositoryInterface;
use App\Catalogs\Infrastructure\Persistence\Repositories\EloquentCatalogRepository;
use App\Incidents\Domain\Repositories\IncidentMetricsRepositoryInterface;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Incidents\Infrastructure\Persistence\Repositories\EloquentIncidentMetricsRepository;
use App\Incidents\Infrastructure\Persistence\Repositories\EloquentIncidentRepository;
use App\Incidents\Infrastructure\Storage\LaravelFileStorageAdapter;
use App\Operations\Domain\Repositories\OperationalStructureRepositoryInterface;
use App\Operations\Infrastructure\Persistence\Repositories\EloquentOperationalStructureRepository;
use App\Shared\Application\Ports\DateTimeProviderPort;
use App\Shared\Application\Ports\FileStoragePort;
use App\Shared\Application\Ports\LoggerPort;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\Shared\Infrastructure\Support\LaravelDateTimeProviderAdapter;
use App\Shared\Infrastructure\Support\LaravelLoggerAdapter;
use App\TerritorialUnits\Domain\Repositories\TerritorialUnitRepositoryInterface;
use App\TerritorialUnits\Infrastructure\Persistence\Repositories\EloquentTerritorialUnitRepository;
use App\Users\Domain\Repositories\AccessControlRepositoryInterface;
use App\Users\Domain\Repositories\UserRepositoryInterface as ModuleUserRepositoryInterface;
use App\Users\Infrastructure\Persistence\Repositories\EloquentAccessControlRepository;
use App\Users\Infrastructure\Persistence\Repositories\EloquentUserRepository as ModuleEloquentUserRepository;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(UserRepositoryInterface::class, EloquentUserRepository::class);
        $this->app->bind(LoginAttemptRepositoryInterface::class, EloquentLoginAttemptRepository::class);
        $this->app->bind(PasswordResetCodeRepositoryInterface::class, EloquentPasswordResetCodeRepository::class);
        $this->app->bind(GoogleTokenVerifierInterface::class, FirebaseGoogleTokenVerifier::class);
        $this->app->bind(CatalogRepositoryInterface::class, EloquentCatalogRepository::class);
        $this->app->bind(AuditRepositoryInterface::class, EloquentAuditRepository::class);
        $this->app->bind(IncidentRepositoryInterface::class, EloquentIncidentRepository::class);
        $this->app->bind(IncidentMetricsRepositoryInterface::class, EloquentIncidentMetricsRepository::class);
        $this->app->bind(FileStoragePort::class, LaravelFileStorageAdapter::class);
        $this->app->bind(ModuleUserRepositoryInterface::class, ModuleEloquentUserRepository::class);
        $this->app->bind(AccessControlRepositoryInterface::class, EloquentAccessControlRepository::class);
        $this->app->bind(TerritorialUnitRepositoryInterface::class, EloquentTerritorialUnitRepository::class);
        $this->app->bind(OperationalStructureRepositoryInterface::class, EloquentOperationalStructureRepository::class);
        $this->app->bind(PasswordHasherPort::class, LaravelPasswordHasherAdapter::class);
        $this->app->bind(SessionManagerPort::class, LaravelSessionManagerAdapter::class);
        $this->app->bind(UserNotificationPort::class, LaravelUserNotificationAdapter::class);
        $this->app->bind(ProfilePhotoStoragePort::class, RustFsProfilePhotoStorageAdapter::class);
        $this->app->bind(LoggerPort::class, LaravelLoggerAdapter::class);
        $this->app->bind(DateTimeProviderPort::class, LaravelDateTimeProviderAdapter::class);
        $this->app->bind(TwoFactorAuthPort::class, GoogleTwoFactorAuthAdapter::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (app()->environment('production')) {
            URL::forceScheme('https');
        }

        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);
        Model::preventLazyLoading(! app()->isProduction());

        RateLimiter::for('login', function (Request $request) {
            $email = (string) $request->input('email');

            return [
                Limit::perMinute(5)->by($request->ip())->response($this->rateLimitResponse()),
                Limit::perMinute(5)->by($email.'|'.$request->ip())->response($this->rateLimitResponse()),
            ];
        });

        RateLimiter::for('register', function (Request $request) {
            $email = (string) $request->input('email');

            return [
                Limit::perHour(3)->by($request->ip())->response($this->rateLimitResponse()),
                Limit::perHour(3)->by($email ?: $request->ip())->response($this->rateLimitResponse()),
            ];
        });

        RateLimiter::for('password.recovery', function (Request $request) {
            $email = strtolower((string) $request->input('email'));

            return [
                Limit::perMinute(30)->by($request->ip())->response($this->rateLimitResponse()),
                Limit::perMinute(3)->by(($email ?: 'unknown').'|'.$request->ip())->response($this->rateLimitResponse()),
            ];
        });

        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip())->response($this->rateLimitResponse());
        });

        RateLimiter::for('catalogs.public', function (Request $request) {
            return Limit::perMinute(120)->by($request->ip());
        });

        RateLimiter::for('incidents.store', function (Request $request) {
            // Nota técnica: El control de duplicados por ubicación/categoría/tiempo
            // debe manejarse como regla de aplicación (Dominio/UseCase), no como rate limit HTTP.
            return Limit::perMinute(10)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('uploads', function (Request $request) {
            return Limit::perMinute(20)->by($request->user()?->id ?: $request->ip())->response($this->rateLimitResponse());
        });
    }

    private function rateLimitResponse(): callable
    {
        return function (Request $request, array $headers) {
            app(AdminNotifier::class)->notify(
                title: 'Rate limit activado',
                message: 'Un usuario superó el límite de intentos permitidos.',
                type: 'STATUS_CHANGE'
            );

            return response()->json([
                'message' => 'Has realizado demasiadas solicitudes. Intenta nuevamente más tarde.',
                'code' => 'RATE_LIMIT_EXCEEDED',
            ], 429, $headers);
        };
    }
}
