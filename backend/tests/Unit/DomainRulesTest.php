<?php

namespace Tests\Unit;

use App\Auth\Domain\Entities\AuthIdentity;
use App\Auth\Domain\Entities\AuthUser;
use App\Incidents\Domain\Entities\Incident;
use App\Incidents\Domain\Entities\IncidentState;
use App\Incidents\Domain\Entities\IncidentTransition;
use App\TerritorialUnits\Domain\Services\TerritorialHierarchyRules;
use App\TerritorialUnits\Domain\ValueObjects\TerritorialUnitType;
use DomainException;
use PHPUnit\Framework\TestCase;

class DomainRulesTest extends TestCase
{
    public function test_incident_can_be_edited_only_when_current_state_allows_it(): void
    {
        $editableIncident = $this->incidentWithState(allowsEdition: true);
        $lockedIncident = $this->incidentWithState(allowsEdition: false);

        $this->assertTrue($editableIncident->canBeEdited());
        $this->assertFalse($lockedIncident->canBeEdited());
    }

    public function test_incident_transition_requires_allowed_role_and_comment_when_configured(): void
    {
        $incident = $this->incidentWithState(allowsEdition: true);
        $transition = new IncidentTransition(
            fromStateId: 1,
            toStateId: 2,
            requiresComment: true,
            allowedRoleCodes: ['ADMIN', 'SUPERVISOR']
        );

        $this->assertFalse($incident->canChangeTo($transition, ['CIUDADANO'], 'Validado.'));
        $this->assertFalse($incident->canChangeTo($transition, ['SUPERVISOR'], '   '));
        $this->assertTrue($incident->canChangeTo($transition, ['SUPERVISOR'], 'Validado por supervisor.'));
    }

    public function test_transition_without_role_restrictions_allows_any_role(): void
    {
        $transition = new IncidentTransition(
            fromStateId: 1,
            toStateId: 2,
            requiresComment: false,
            allowedRoleCodes: []
        );

        $this->assertTrue($transition->isAllowedForRoles(['CIUDADANO']));
        $this->assertTrue($transition->isAllowedForRoles([]));
    }

    public function test_auth_user_reports_verified_email_two_factor_and_google_identity_conflicts(): void
    {
        $user = new AuthUser(
            id: 10,
            firstName: 'Damian',
            lastName: 'Torres',
            username: 'damiantorres',
            email: 'damian@example.com',
            passwordHash: null,
            phone: null,
            profilePhoto: null,
            isActive: true,
            emailVerifiedAt: '2026-06-29T00:00:00+00:00',
            lastAccessAt: null,
            twoFactorSecret: 'secret',
            twoFactorConfirmedAt: '2026-06-29T00:00:00+00:00',
            roleCodes: ['CIUDADANO'],
            permissionCodes: ['incidents.create']
        );

        $sameUserIdentity = new AuthIdentity(
            userId: 10,
            provider: 'google',
            providerUid: 'firebase-uid',
            providerEmail: 'damian@example.com',
            verifiedAt: null,
            lastUsedAt: null
        );

        $otherUserIdentity = new AuthIdentity(
            userId: 99,
            provider: 'google',
            providerUid: 'firebase-uid',
            providerEmail: 'damian@example.com',
            verifiedAt: null,
            lastUsedAt: null
        );

        $this->assertTrue($user->hasVerifiedEmail());
        $this->assertTrue($user->isTwoFactorEnabled());
        $this->assertSame(sha1('damian@example.com'), $user->emailVerificationHash());
        $this->assertFalse($user->isGoogleLinkedToAnotherUser($sameUserIdentity));
        $this->assertTrue($user->isGoogleLinkedToAnotherUser($otherUserIdentity));
    }

    public function test_territorial_hierarchy_allows_valid_parent_chain(): void
    {
        $rules = new TerritorialHierarchyRules();

        $rules->validate(TerritorialUnitType::PROVINCE, null);
        $rules->validate(TerritorialUnitType::CANTON, TerritorialUnitType::PROVINCE, 1);
        $rules->validate(TerritorialUnitType::PARISH, TerritorialUnitType::CANTON, 2, [1]);
        $rules->validate(TerritorialUnitType::SECTOR, TerritorialUnitType::PARISH, 3, [2, 1]);

        $this->addToAssertionCount(4);
    }

    public function test_territorial_hierarchy_rejects_invalid_parent_type(): void
    {
        $this->expectException(DomainException::class);

        (new TerritorialHierarchyRules())->validate(
            TerritorialUnitType::PARISH,
            TerritorialUnitType::PROVINCE,
            1
        );
    }

    public function test_territorial_hierarchy_rejects_cycles(): void
    {
        $this->expectException(DomainException::class);

        (new TerritorialHierarchyRules())->validate(
            TerritorialUnitType::PARISH,
            TerritorialUnitType::CANTON,
            2,
            [10, 1],
            10
        );
    }

    private function incidentWithState(bool $allowsEdition): Incident
    {
        return new Incident(
            id: 1,
            code: 'INC-2026-00001',
            title: 'Incidencia de prueba',
            description: 'Descripcion de prueba',
            reporterUserId: 10,
            assigneeUserId: null,
            stateId: 1,
            state: new IncidentState(
                id: 1,
                name: 'NUEVA',
                allowsEdition: $allowsEdition,
                isFinal: ! $allowsEdition
            )
        );
    }
}
