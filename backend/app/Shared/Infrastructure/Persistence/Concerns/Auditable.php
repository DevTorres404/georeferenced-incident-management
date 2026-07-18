<?php

namespace App\Shared\Infrastructure\Persistence\Concerns;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;

trait Auditable
{
    protected static function bootAuditable(): void
    {
        static::created(function (Model $model): void {
            static::writeAuditLog($model, 'created', null, static::snapshot($model));
        });

        static::updated(function (Model $model): void {
            $changes = Arr::except($model->getChanges(), ['updated_at']);

            if ($changes === []) {
                return;
            }

            $changedKeys = array_keys($changes);

            static::writeAuditLog(
                $model,
                'updated',
                static::snapshot($model, Arr::only($model->getOriginal(), $changedKeys)),
                static::snapshot($model, Arr::only($model->getAttributes(), $changedKeys))
            );
        });

        static::deleted(function (Model $model): void {
            static::writeAuditLog($model, 'deleted', static::snapshot($model), null);
        });

        if (method_exists(static::class, 'restored')) {
            static::restored(function (Model $model): void {
                static::writeAuditLog($model, 'restored', null, static::snapshot($model));
            });
        }
    }

    /**
     * @param  array<string, mixed>|null  $values
     * @return array<string, mixed>|null
     */
    private static function snapshot(Model $model, ?array $values = null): ?array
    {
        if ($values === null) {
            $values = $model->getAttributes();
        }

        $hidden = method_exists($model, 'getHidden') ? $model->getHidden() : [];
        $sensitive = [
            'password',
            'remember_token',
            'two_factor_secret',
            'two_factor_recovery_codes',
        ];

        return Arr::except($values, array_unique([...$hidden, ...$sensitive]));
    }

    /**
     * @param  array<string, mixed>|null  $oldValues
     * @param  array<string, mixed>|null  $newValues
     */
    private static function writeAuditLog(
        Model $model,
        string $event,
        ?array $oldValues,
        ?array $newValues
    ): void {
        AuditLog::create([
            'auditable_type' => $model::class,
            'auditable_id' => (int) $model->getKey(),
            'event' => $event,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'url' => static::currentUrl(),
            'user_id' => Auth::id(),
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'tags' => [
                'table' => $model->getTable(),
            ],
        ]);
    }

    private static function currentUrl(): ?string
    {
        if (app()->runningInConsole()) {
            return null;
        }

        return request()?->fullUrl();
    }
}
