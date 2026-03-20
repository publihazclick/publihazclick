import {
  Component, inject, signal, ChangeDetectionStrategy, ChangeDetectorRef, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  TestimonialsService, PaymentTestimonial, computeImageHash, DuplicateCheckResult
} from '../../../../core/services/testimonials.service';

type ItemStatus = 'analyzing' | 'ok' | 'duplicate' | 'uploading' | 'done' | 'error';

interface UploadItem {
  file: File;
  preview: string;
  phash: string;
  status: ItemStatus;
  errorMsg?: string;
  dupCheck?: DuplicateCheckResult;
}

@Component({
  selector: 'app-admin-subir-test',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './subir-test.component.html',
})
export class AdminSubirTestComponent implements OnInit {
  private readonly svc  = inject(TestimonialsService);
  private readonly cdr  = inject(ChangeDetectorRef);

  readonly loadingList = signal(true);
  readonly uploading   = signal(false);
  readonly analyzing   = signal(false);
  readonly isDragging  = signal(false);

  queue: UploadItem[] = [];
  testimonials = signal<PaymentTestimonial[]>([]);

  private totalUploaded = 0;

  async ngOnInit(): Promise<void> {
    await this.refreshList();
    // Pre-cargar el cache de hashes para que el análisis sea rápido
    await this.svc.loadHashCache();
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

  onDragOver(e: DragEvent): void { e.preventDefault(); this.isDragging.set(true); }
  onDragLeave(): void { this.isDragging.set(false); }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    this.addFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  onFileSelected(event: Event): void {
    this.addFiles(Array.from((event.target as HTMLInputElement).files ?? []));
    (event.target as HTMLInputElement).value = '';
  }

  private addFiles(files: File[]): void {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (!images.length) return;

    let loaded = 0;
    for (const file of images) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.queue.push({
          file,
          preview: e.target?.result as string,
          phash: '',
          status: 'analyzing',
        });
        loaded++;
        if (loaded === images.length) {
          this.cdr.markForCheck();
          // Analizar todas las imágenes recién agregadas
          this.analyzeQueue();
        }
      };
      reader.readAsDataURL(file);
    }
  }

  /**
   * Fase de análisis: calcula el hash perceptual de cada imagen en estado
   * 'analyzing' y la compara contra todas las existentes en la DB.
   */
  private async analyzeQueue(): Promise<void> {
    this.analyzing.set(true);

    const toAnalyze = this.queue.filter(q => q.status === 'analyzing');

    for (const item of toAnalyze) {
      try {
        // 1. Calcular hash perceptual
        const phash = await computeImageHash(item.file);
        item.phash = phash;

        // 2. Comparar con hashes existentes en DB
        const dupCheck = await this.svc.checkDuplicate(item.file);
        item.dupCheck = dupCheck;

        // 3. También comparar con otras imágenes en la cola actual (ya analizadas)
        //    para evitar subir duplicados entre las imágenes seleccionadas
        const queueDup = this.findDuplicateInQueue(phash, item);

        if (dupCheck.isDuplicate) {
          item.status = 'duplicate';
        } else if (queueDup) {
          item.status = 'duplicate';
          item.dupCheck = {
            isDuplicate: true,
            similarity: Math.round(((256 - queueDup.distance) / 256) * 100),
            distance: queueDup.distance,
            matchedImage: queueDup.preview,
            matchedUsername: '(otra imagen de esta misma selección)',
          };
        } else {
          item.status = 'ok';
        }
      } catch {
        item.status = 'ok'; // Si falla el análisis, dejar pasar (mejor subir que bloquear)
        item.phash = '';
      }
      this.cdr.markForCheck();
    }

    this.analyzing.set(false);
    this.cdr.markForCheck();
  }

  /** Busca si ya hay otra imagen en la cola con hash similar */
  private findDuplicateInQueue(
    phash: string,
    current: UploadItem
  ): { distance: number; preview: string } | null {
    if (!phash) return null;
    // Importar la función inline para evitar importar el módulo completo
    const hammingDist = (a: string, b: string): number => {
      if (a.length !== b.length) return 256;
      let d = 0;
      for (let i = 0; i < a.length; i++) {
        const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
        d += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
      }
      return d;
    };

    for (const other of this.queue) {
      if (other === current) continue;
      if (!other.phash || other.status === 'analyzing') continue;
      const d = hammingDist(phash, other.phash);
      if (d <= 15) return { distance: d, preview: other.preview };
    }
    return null;
  }

  removeFromQueue(idx: number): void {
    this.queue.splice(idx, 1);
    this.cdr.markForCheck();
  }

  removeDuplicates(): void {
    this.queue = this.queue.filter(q => q.status !== 'duplicate');
    this.cdr.markForCheck();
  }

  /** Forzar aprobación manual de una imagen marcada como duplicada */
  forceApprove(item: UploadItem): void {
    item.status = 'ok';
    item.dupCheck = undefined;
    this.cdr.markForCheck();
  }

  async uploadAll(): Promise<void> {
    if (this.uploading()) return;
    const ready = this.queue.filter(q => q.status === 'ok');
    if (!ready.length) return;

    this.uploading.set(true);
    let idx = this.totalUploaded;

    for (const item of ready) {
      item.status = 'uploading';
      this.cdr.markForCheck();
      try {
        await this.svc.uploadAndCreate(item.file, idx++, item.phash);
        item.status = 'done';
      } catch (err: any) {
        item.status = 'error';
        item.errorMsg = err.message;
      }
      this.cdr.markForCheck();
    }

    this.uploading.set(false);
    setTimeout(async () => {
      this.queue = this.queue.filter(q => q.status !== 'done');
      this.svc.invalidateCache();
      await this.svc.loadHashCache();
      await this.refreshList();
      this.cdr.markForCheck();
    }, 1200);
  }

  async toggleActive(t: PaymentTestimonial): Promise<void> {
    await this.svc.toggleActive(t.id, !t.active).catch(() => {});
    await this.refreshList();
  }

  async deleteTestimonial(id: string): Promise<void> {
    if (!confirm('¿Eliminar este testimonio?')) return;
    await this.svc.delete(id).catch(() => {});
    await this.refreshList();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  get pendingOk(): number      { return this.queue.filter(q => q.status === 'ok').length; }
  get pendingDup(): number     { return this.queue.filter(q => q.status === 'duplicate').length; }
  get pendingAnalyze(): number { return this.queue.filter(q => q.status === 'analyzing').length; }
  get doneCount(): number      { return this.queue.filter(q => q.status === 'done').length; }
  get uploadingCount(): number { return this.queue.filter(q => q.status === 'uploading').length; }
}
