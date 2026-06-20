<?php

namespace App\Providers;

use App\Auth\Infrastructure\Persistence\Models\PersonalAccessToken;
use App\Auth\Domain\Repositories\UserRepositoryInterface;
use App\Auth\Domain\Repositories\LoginAttemptRepositoryInterface;
use App\Auth\Domain\Services\GoogleTokenVerifierInterface;
use App\Auth\Infrastructure\Repositories\EloquentUserRepository;
use App\Auth\Infrastructure\Repositories\EloquentLoginAttemptRepository;
use App\Auth\Infrastructure\Services\FirebaseGoogleTokenVerifier;
use App\Audit\Domain\Repositories\AuditRepositoryInterface;
use App\Audit\Infrastructure\Persistence\Repositories\EloquentAuditRepository;
use App\Catalogs\Domain\Repositories\CatalogRepositoryInterface;
use App\Catalogs\Infrastructure\Persistence\Repositories\EloquentCatalogRepository;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Incidents\Infrastructure\Persistence\Repositories\EloquentIncidentRepository;
use App\Incidents\Infrastructure\Storage\LaravelFileStorageAdapter;
use App\Shared\Application\Ports\FileStoragePort;
use App\Users\Domain\Repositories\UserRepositoryInterface as ModuleUserRepositoryInterface;
use App\Users\Infrastructure\Persistence\Repositories\EloquentUserRepository as ModuleEloquentUserRepository;
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
        $this->app->bind(GoogleTokenVerifierInterface::class, FirebaseGoogleTokenVerifier::class);
        $this->app->bind(CatalogRepositoryInterface::class, EloquentCatalogRepository::class);
        $this->app->bind(AuditRepositoryInterface::class, EloquentAuditRepository::class);
        $this->app->bind(IncidentRepositoryInterface::class, EloquentIncidentRepository::class);
        $this->app->bind(FileStoragePort::class, LaravelFileStorageAdapter::class);
        $this->app->bind(ModuleUserRepositoryInterface::class, ModuleEloquentUserRepository::class);
        $this->app->bind(\App\Auth\Application\Ports\PasswordHasherPort::class, \App\Auth\Infrastructure\Services\LaravelPasswordHasherAdapter::class);
        $this->app->bind(\App\Auth\Application\Ports\SessionManagerPort::class, \App\Auth\Infrastructure\Services\LaravelSessionManagerAdapter::class);
        $this->app->bind(\App\Auth\Application\Ports\UserNotificationPort::class, \App\Auth\Infrastructure\Services\LaravelUserNotificationAdapter::class);
        $this->app->bind(\App\Shared\Application\Ports\LoggerPort::class, \App\Shared\Infrastructure\Support\LaravelLoggerAdapter::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \Laravel\Sanctum\Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);
    }
}

