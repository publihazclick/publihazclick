import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface ActionPrice {
  id: string;
  label: string;
  category: string;
  price_cop: number;
  cost_cop: number;
  is_active: boolean;
  description: string;
}

@Component({
  selector: 'app-admin-ai-pricing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-pricing.component.html',
})
export class AdminAiPricingComponent implements OnInit {
  private readonly supabase = getSupabaseClient();

  readonly actions = signal<ActionPrice[]>([]);
  readonly loading = signal(true);
  readonly saving = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  readonly totalRevenue = computed(() => {
    return this.actions().reduce((sum, a) => sum + a.price_cop, 0);
  });

  readonly totalCost = computed(() => {
    return this.actions().reduce((sum, a) => sum + a.cost_cop, 0);
  });

  readonly categories = ['script', 'image', 'voice', 'video', 'tools'];

  getCategoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      script: 'Guiones', image: 'Imágenes', voice: 'Voces', video: 'Videos', tools: 'Herramientas',
    };
    return labels[cat] ?? cat;
  }

  getCategoryIcon(cat: string): string {
    const icons: Record<string, string> = {
      script: 'edit_note', image: 'image', voice: 'mic', video: 'videocam', tools: 'build',
    };
    return icons[cat] ?? 'paid';
  }

  getActionsByCategory(cat: string): ActionPrice[] {
    return this.actions().filter(a => a.category === cat);
  }

  getMargin(a: ActionPrice): number {
    return a.price_cop - a.cost_cop;
  }

  getMarginPercent(a: ActionPrice): number {
    if (a.price_cop === 0) return 0;
    return Math.round(((a.price_cop - a.cost_cop) / a.price_cop) * 100);
  }

  async ngOnInit(): Promise<void> {
    await this.loadPricing();
    this.loading.set(false);
  }

  private async loadPricing(): Promise<void> {
    const { data } = await this.supabase
      .from('ai_action_pricing')
      .select('*')
      .order('category')
      .order('price_cop');
    if (data) this.actions.set(data);
  }

  async updatePrice(action: ActionPrice, newPrice: number): Promise<void> {
    if (newPrice < 0) return;
    this.saving.set(action.id);

    await this.supabase
      .from('ai_action_pricing')
      .update({ price_cop: newPrice, updated_at: new Date().toISOString() })
      .eq('id', action.id);

    this.actions.update(list =>
      list.map(a => a.id === action.id ? { ...a, price_cop: newPrice } : a)
    );
    this.showSuccess(`${action.label}: ${this.formatCOP(newPrice)}`);
    this.saving.set(null);
  }

  async updateCost(action: ActionPrice, newCost: number): Promise<void> {
    if (newCost < 0) return;
    this.saving.set(action.id);

    await this.supabase
      .from('ai_action_pricing')
      .update({ cost_cop: newCost, updated_at: new Date().toISOString() })
      .eq('id', action.id);

    this.actions.update(list =>
      list.map(a => a.id === action.id ? { ...a, cost_cop: newCost } : a)
    );
    this.saving.set(null);
  }

  async toggleActive(action: ActionPrice): Promise<void> {
    const newVal = !action.is_active;
    await this.supabase
      .from('ai_action_pricing')
      .update({ is_active: newVal, updated_at: new Date().toISOString() })
      .eq('id', action.id);

    this.actions.update(list =>
      list.map(a => a.id === action.id ? { ...a, is_active: newVal } : a)
    );
  }

  formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  }

  private showSuccess(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 2000);
  }
}
