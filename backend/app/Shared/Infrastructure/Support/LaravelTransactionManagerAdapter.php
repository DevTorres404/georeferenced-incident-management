<?php

namespace App\Shared\Infrastructure\Support;

use App\Shared\Application\Ports\TransactionManagerPort;
use Illuminate\Support\Facades\DB;

final class LaravelTransactionManagerAdapter implements TransactionManagerPort
{
    public function run(callable $operation): mixed
    {
        return DB::transaction($operation);
    }
}
