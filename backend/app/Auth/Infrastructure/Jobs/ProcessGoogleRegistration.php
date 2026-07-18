<?php

namespace App\Auth\Infrastructure\Jobs;

use App\Auth\Application\DTOs\GoogleAuthInputData;
use App\Auth\Application\UseCases\GoogleRegistrationUseCase;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Infrastructure\Events\GoogleRegistrationUpdated;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class ProcessGoogleRegistration implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public string $intent,
        public string $flowId,
        public string $idToken,
        public string $ip,
        public ?string $userAgent
    ) {}

    public function handle(GoogleRegistrationUseCase $useCase): void
    {
        event(new GoogleRegistrationUpdated(
            $this->flowId,
            'processing',
            'Estamos preparando tu acceso con Google.'
        ));

        try {
            $result = $useCase->execute(new GoogleAuthInputData(
                intent: $this->intent,
                idToken: $this->idToken,
                ip: $this->ip,
                userAgent: $this->userAgent
            ));

            event(new GoogleRegistrationUpdated(
                $this->flowId,
                'completed',
                $result->message,
                $result->jsonSerialize()
            ));
        } catch (AuthException $e) {
            event(new GoogleRegistrationUpdated(
                $this->flowId,
                'failed',
                $e->getMessage(),
                ['code' => $e->getCode()]
            ));

            throw $e;
        } catch (Throwable $e) {
            event(new GoogleRegistrationUpdated(
                $this->flowId,
                'failed',
                'No se pudo completar el registro con Google.',
                ['error' => $e->getMessage()]
            ));

            throw $e;
        }
    }
}
