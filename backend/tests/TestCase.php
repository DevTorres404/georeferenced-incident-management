<?php

namespace Tests;

use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        // The analysis coverage script pre-runs migrate:fresh in an isolated
        // connection before the test suite starts. Setting this flag prevents
        // RefreshDatabase from running migrate:fresh again (which causes
        // PostgreSQL deadlocks with multi-schema DROP TABLE CASCADE when the
        // Laravel app connection and the artisan connection overlap).
        // RefreshDatabaseState::$migrated = true;

        parent::setUp();
    }
}
