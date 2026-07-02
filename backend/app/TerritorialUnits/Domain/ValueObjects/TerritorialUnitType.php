<?php

namespace App\TerritorialUnits\Domain\ValueObjects;

final class TerritorialUnitType
{
    public const COUNTRY = 'country';
    public const OPERATIONAL_ZONE = 'operational_zone';
    public const PROVINCE = 'province';
    public const CANTON = 'canton';
    public const PARISH = 'parish';
    public const SECTOR = 'sector';

    public const ALL = [
        self::COUNTRY,
        self::OPERATIONAL_ZONE,
        self::PROVINCE,
        self::CANTON,
        self::PARISH,
        self::SECTOR,
    ];

    private const EXPECTED_PARENT_TYPE = [
        self::COUNTRY => null,
        self::OPERATIONAL_ZONE => self::COUNTRY,
        self::PROVINCE => self::OPERATIONAL_ZONE,
        self::CANTON => self::PROVINCE,
        self::PARISH => self::CANTON,
        self::SECTOR => self::PARISH,
    ];

    public static function isValid(string $type): bool
    {
        return in_array($type, self::ALL, true);
    }

    public static function expectedParentType(string $type): ?string
    {
        return self::EXPECTED_PARENT_TYPE[$type] ?? null;
    }
}
