import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-ia-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ia-landing.component.html',
})
export class IaPublicLandingComponent {
  readonly billingCycle = signal<'monthly' | 'annual'>('monthly');
}
