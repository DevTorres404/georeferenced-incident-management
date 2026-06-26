<?php

use App\Auth\Infrastructure\Http\Controllers\AuthController;
use App\Auth\Infrastructure\Http\Controllers\TwoFactorAuthController;
use App\Audit\Infrastructure\Http\Controllers\AuditController;
use App\Catalogs\Infrastructure\Http\Controllers\CatalogController;
use App\Catalogs\Infrastructure\Http\Controllers\CatalogManagementController;
use App\Incidents\Infrastructure\Http\Controllers\IncidentController;
use App\Incidents\Infrastructure\Http\Controllers\NotificationController;
use App\Users\Infrastructure\Http\Controllers\AccessControlController;
use App\Users\Infrastructure\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/auth/google', [AuthController::class, 'google']);
Route::post('/auth/2fa/verify-login', [TwoFactorAuthController::class, 'verifyLogin'])->middleware('throttle:login');
Route::get('/auth/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])
    ->middleware('signed')
    ->name('verification.verify');

Route::prefix('catalogs')->middleware('throttle:catalogs.public')->group(function () {
    Route::get('/', [CatalogController::class, 'index']);
    Route::get('/countries', [CatalogController::class, 'countries']);
    Route::get('/countries/{pais}/provinces', [CatalogController::class, 'provinces']);
    Route::get('/provinces/{provincia}/cities', [CatalogController::class, 'cities']);
    Route::get('/categories', [CatalogController::class, 'categories']);
    Route::get('/categories/{categoria}/subcategories', [CatalogController::class, 'subcategories']);
    Route::get('/priorities', [CatalogController::class, 'priorities']);
    Route::get('/states', [CatalogController::class, 'states']);
    Route::get('/states/{estado}/transitions', [CatalogController::class, 'transitions']);
    Route::get('/transitions', [CatalogController::class, 'transitions']);
});

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/auth/email/verification-notification', [AuthController::class, 'resendVerificationEmail'])
        ->middleware('throttle:6,1');
    Route::post('/auth/profile', [AuthController::class, 'completeProfile']);
    Route::patch('/auth/profile', [AuthController::class, 'updateProfile']);
    
    Route::post('/auth/2fa/enable', [TwoFactorAuthController::class, 'enable']);
    Route::post('/auth/2fa/confirm', [TwoFactorAuthController::class, 'confirm']);

    Route::middleware('2fa.admin')->group(function () {
        Route::get('/catalogs/roles', [CatalogController::class, 'roles'])->middleware('permission:users.view');
        Route::get('/catalogs/permissions', [CatalogController::class, 'permissions'])->middleware('permission:users.manage_roles');

        Route::get('/dashboard/metrics', [\App\Incidents\Infrastructure\Http\Controllers\DashboardController::class, 'metrics'])
            ->middleware('permission:incidents.view');

        Route::post('/incidents', [IncidentController::class, 'store'])->middleware('throttle:incidents.store');
        Route::apiResource('/incidents', IncidentController::class)
            ->parameters(['incidents' => 'incident'])
            ->except(['store']);
        Route::post('/incidents/{incident}/comments', [IncidentController::class, 'addComment']);
        Route::post('/incidents/{incident}/attachments', [IncidentController::class, 'addAttachment'])
            ->middleware('throttle:uploads');
        Route::post('/incidents/{incident}/assignments', [IncidentController::class, 'assign'])
            ->middleware('permission:incidents.assign');
        Route::patch('/incidents/{incident}/state', [IncidentController::class, 'changeState'])
            ->middleware('permission:incidents.edit');

        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::get('/notifications/unread/count', [NotificationController::class, 'unreadCount']);
        Route::patch('/notifications/mark-all-read', [NotificationController::class, 'markAllAsRead']);
        Route::patch('/notifications/{notificacion}/read', [NotificationController::class, 'markAsRead']);

        Route::apiResource('/users', UserController::class)
            ->parameters(['users' => 'user'])
            ->middleware('permission:users.view');
        Route::put('/users/{user}/roles', [UserController::class, 'syncUserRoles'])
            ->middleware('permission:users.manage_roles');

        Route::middleware('permission:users.manage_roles')->group(function () {
            Route::get('/admin/access-control', [AccessControlController::class, 'index']);
            Route::put('/admin/roles/{role}/permissions', [AccessControlController::class, 'syncRolePermissions']);
            Route::patch('/admin/roles/{role}/permissions', [AccessControlController::class, 'syncRolePermissions']);
        });

        Route::middleware('permission:catalogs.manage')->group(function () {
            Route::get('/admin/catalogs/{catalog}', [CatalogManagementController::class, 'index']);
            Route::post('/admin/catalogs/{catalog}', [CatalogManagementController::class, 'store']);
            Route::get('/admin/catalogs/{catalog}/{id}', [CatalogManagementController::class, 'show']);
            Route::put('/admin/catalogs/{catalog}/{id}', [CatalogManagementController::class, 'update']);
            Route::patch('/admin/catalogs/{catalog}/{id}', [CatalogManagementController::class, 'update']);
            Route::delete('/admin/catalogs/{catalog}/{id}', [CatalogManagementController::class, 'destroy']);
        });

        Route::prefix('audit')->middleware('permission:audit.view')->group(function () {
            Route::get('/logs', [AuditController::class, 'logs']);
            Route::get('/login-attempts', [AuditController::class, 'loginAttempts']);
        });
    });
});
