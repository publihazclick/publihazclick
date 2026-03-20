import {
  Component, inject, signal, ChangeDetectionStrategy, ChangeDetectorRef, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TestimonialsService, PaymentTestimonial } from '../../../../core/services/testimonials.service';

interface UploadItem {
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

@Component({
  selector: 'app-admin-subir-test',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './subir-test.component.html',
})
export class AdminSubirTestComponent implements OnInit {
  private readonly svc = inject(TestimonialsService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly loadingList  = signal(true);
  readonly uploading    = signal(false);
  readonly isDragging   = signal(false);

  queue: UploadItem[] = [];
  testimonials = signal<PaymentTestimonial[]>([]);

  // Contador global de uploads para variar comentarios/nombres
  private totalUploaded = 0;

  async ngOnInit(): Promise<void> {
    await this.refreshList();
  }

  private async refreshList(): Promise<void> {
    this.loadingList.set(true);
    try {
      const list = await this.svc.getAll();
      this.testimonials.set(list);
      this.totalUploaded = list.length;
    } finally {
      this.loadingList.set(false);
    }
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(): void {
    this.isDragging.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    this.addFiles(files);
  }

  onFileSelected(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    this.addFiles(files);
    (event.target as HTMLInputElement).value = '';
  }

  private addFiles(files: File[]): void {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    for (const file of imageFiles) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.queue.push({ file, preview: e.target?.result as string, status: 'pending' });
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    }
  }

  removeFromQueue(idx: number): void {
    this.queue.splice(idx, 1);
  }

  async uploadAll(): Promise<void> {
    if (this.uploading()) return;
    const pending = this.queue.filter(q => q.status === 'pending');
    if (!pending.length) return;

    this.uploading.set(true);
    let idx = this.totalUploaded;

    for (const item of pending) {
      item.status = 'uploading';
      this.cdr.markForCheck();
      try {
        await this.svc.uploadAndCreate(item.file, idx++);
        item.status = 'done';
      } catch (err: any) {
        item.status = 'error';
        item.errorMsg = err.message;
      }
      this.cdr.markForCheck();
    }

    this.uploading.set(false);
    // Limpiar los completados y refrescar lista
    setTimeout(async () => {
      this.queue = this.queue.filter(q => q.status !== 'done');
      await this.refreshList();
      this.cdr.markForCheck();
    }, 1200);
  }

  clearDone(): void {
    this.queue = this.queue.filter(q => q.status !== 'done' && q.status !== 'error');
    this.cdr.markForCheck();
  }

  async toggleActive(t: PaymentTestimonial): Promise<void> {
    try {
      await this.svc.toggleActive(t.id, !t.active);
      await this.refreshList();
    } catch { /* ignore */ }
  }

  async deleteTestimonial(id: string): Promise<void> {
    if (!confirm('¿Eliminar este testimonio?')) return;
    try {
      await this.svc.delete(id);
      await this.refreshList();
    } catch { /* ignore */ }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  get pendingCount(): number { return this.queue.filter(q => q.status === 'pending').length; }
  get uploadingCount(): number { return this.queue.filter(q => q.status === 'uploading').length; }
  get doneCount(): number { return this.queue.filter(q => q.status === 'done').length; }
}
