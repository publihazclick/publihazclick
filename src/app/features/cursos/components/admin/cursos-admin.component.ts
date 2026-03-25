import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CursosService } from '../../../../core/services/cursos.service';
import type { Course, CoursePurchase } from '../../../../core/models/cursos.model';

type AdminTab = 'pending' | 'all' | 'transactions';

@Component({
  selector: 'app-cursos-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './cursos-admin.component.html',
})
export class CursosAdminComponent implements OnInit {
  private readonly cursosService = inject(CursosService);

  readonly tab          = signal<AdminTab>('pending');
  readonly pending      = signal<Course[]>([]);
  readonly allCourses   = signal<Course[]>([]);
  readonly transactions = signal<CoursePurchase[]>([]);
  readonly loading      = signal(true);
  readonly actionMsg    = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadPending();
    this.loading.set(false);
  }

  async switchTab(t: AdminTab): Promise<void> {
    this.tab.set(t);
    this.loading.set(true);
    if (t === 'pending') await this.loadPending();
    else if (t === 'all') await this.loadAll();
    else await this.loadTransactions();
    this.loading.set(false);
  }

  async loadPending(): Promise<void> {
    this.pending.set(await this.cursosService.getAdminPendingCourses());
  }

  async loadAll(): Promise<void> {
    this.allCourses.set(await this.cursosService.getAdminAllCourses());
  }

  async loadTransactions(): Promise<void> {
    this.transactions.set(await this.cursosService.getAdminAllTransactions());
  }

  async approve(course: Course): Promise<void> {
    await this.cursosService.adminApproveCourse(course.id);
    this.showMsg(`"${course.title}" aprobado`);
    await this.loadPending();
  }

  async reject(course: Course): Promise<void> {
    const reason = prompt('Motivo de rechazo:');
    if (reason === null) return;
    await this.cursosService.adminRejectCourse(course.id, reason);
    this.showMsg(`"${course.title}" rechazado`);
    await this.loadPending();
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private showMsg(msg: string): void {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(null), 3000);
  }
}
