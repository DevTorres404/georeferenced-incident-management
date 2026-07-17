<?php
try {
    DB::statement("CREATE DATABASE incident_management_system_testing");
    echo "Database created successfully.\n";
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
