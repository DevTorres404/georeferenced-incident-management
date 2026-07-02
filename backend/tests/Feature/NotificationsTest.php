<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Broadcasting\NotificationCreated;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class NotificationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_notification_creation_dispatches_realtime_event(): void
    {
        Event::fake([NotificationCreated::class]);

        $user = User::factory()->create();

        Notification::create([
            'user_id' => $user->id,
            'title' => 'Incidencia registrada',
            'message' => 'Tu incidencia INC-000123 fue registrada correctamente.',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        Event::assertDispatched(NotificationCreated::class);
    }

    public function test_user_can_fetch_notifications(): void
    {
        $user = User::factory()->create();
        
        Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 1',
            'message' => 'This is a test notification.',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 2',
            'message' => 'This is another test notification.',
            'type' => 'STATUS_CHANGE',
            'is_read' => true,
        ]);

        $response = $this->actingAs($user)->getJson('/api/notifications');

        $response->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(2, 'data');
    }

    public function test_user_can_filter_unread_notifications(): void
    {
        $user = User::factory()->create();
        
        Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 1',
            'message' => 'This is a test notification.',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 2',
            'message' => 'This is another test notification.',
            'type' => 'STATUS_CHANGE',
            'is_read' => true,
        ]);

        $response = $this->actingAs($user)->getJson('/api/notifications?leida=0');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_read', false);
    }

    public function test_user_can_get_unread_notifications_count(): void
    {
        $user = User::factory()->create();
        
        Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 1',
            'message' => 'Message 1',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 2',
            'message' => 'Message 2',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        $response = $this->actingAs($user)->getJson('/api/notifications/unread/count');

        $response->assertOk()
            ->assertJsonPath('count', 2);
    }

    public function test_user_can_mark_notification_as_read(): void
    {
        $user = User::factory()->create();
        
        $notification = Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 1',
            'message' => 'Message 1',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        $response = $this->actingAs($user)->patchJson("/api/notifications/{$notification->id}/read");

        $response->assertOk()
            ->assertJsonPath('data.is_read', true);

        $this->assertTrue($notification->fresh()->is_read);
    }

    public function test_user_cannot_mark_other_users_notification_as_read(): void
    {
        $user1 = User::factory()->create();
        $user2 = User::factory()->create();
        
        $notification = Notification::create([
            'user_id' => $user2->id,
            'title' => 'Test Notification',
            'message' => 'Message',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        $response = $this->actingAs($user1)->patchJson("/api/notifications/{$notification->id}/read");

        $response->assertForbidden();
    }

    public function test_user_can_mark_all_notifications_as_read(): void
    {
        $user = User::factory()->create();
        
        Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 1',
            'message' => 'Message 1',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        Notification::create([
            'user_id' => $user->id,
            'title' => 'Test Notification 2',
            'message' => 'Message 2',
            'type' => 'STATUS_CHANGE',
            'is_read' => false,
        ]);

        $response = $this->actingAs($user)->patchJson('/api/notifications/mark-all-read');

        $response->assertOk()
            ->assertJsonPath('message', 'Notificaciones marcadas como leídas.');

        $this->assertEquals(0, Notification::where('user_id', $user->id)->where('is_read', false)->count());
    }
}
