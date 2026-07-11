<?php

namespace App\Shared\Infrastructure\Jobs;

use App\Shared\Infrastructure\Notifications\AdminNotifier;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

final class NotifyAdminsJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param  array<int, int>  $excludeUserIds
     */
    public function __construct(
        public readonly string $title,
        public readonly string $message,
        public readonly string $type = 'STATUS_CHANGE',
        public readonly array $excludeUserIds = [],
        public readonly ?int $incidentId = null
    ) {}

    public function handle(AdminNotifier $notifier): void
    {
        $notifier->notify(
            title: $this->title,
            message: $this->message,
            type: $this->type,
            excludeUserIds: $this->excludeUserIds,
            incidentId: $this->incidentId
        );
    }
}
