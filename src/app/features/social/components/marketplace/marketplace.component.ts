import { Component, ChangeDetectionStrategy, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SocialService } from '../../../../core/services/social.service';
import { StorageService } from '../../../../core/services/storage.service';
import { ProfileService } from '../../../../core/services/profile.service';
import type {
  MarketplaceListing,
  CreateListingData,
  UpdateListingData,
  ListingStatus,
} from '../../../../core/models/social.model';
import { MARKETPLACE_CATEGORIES } from '../../../../core/models/social.model';
import { BannerSliderComponent } from '../../../../components/banner-slider/banner-slider.component';

type ModalMode = 'create' | 'edit' | null;

@Component({
  selector: 'app-marketplace',
  standalone: true,
  imports: [CommonModule, FormsModule, BannerSliderComponent],
  templateUrl: './marketplace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceComponent {
  private readonly socialService = inject(SocialService);
  private readonly storageService = inject(StorageService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly profile = this.profileService.profile;
  readonly categories = MARKETPLACE_CATEGORIES;

  // List state
  listings = signal<MarketplaceListing[]>([]);
  loading = signal(true);
  searchTerm = '';
  filterCategory = '';
  showMine = false;
  currentPage = 0;
  hasMore = signal(true);

  // Modal state
  modalMode = signal<ModalMode>(null);
  editingListing = signal<MarketplaceListing | null>(null);
  saving = signal(false);

  // Form fields
  formTitle = '';
  formDescription = '';
  formPrice: number | null = null;
  formCategory = '';
  formTags: string[] = [];
  formTagInput = '';
  formImages: string[] = [];
  formContactLink = '';

  // Image upload
  uploadingImage = signal(false);

  // Detail modal
  detailListing = signal<MarketplaceListing | null>(null);
  carouselIndex = signal(0);

  // Delete confirm
  deletingId = signal<string | null>(null);

  // Toast
  toast = signal<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Action loading
  actionLoading = signal<string | null>(null);

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
    this.loadMyCount();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      let data: MarketplaceListing[];
      if (this.showMine) {
        data = await this.socialService.getMyListings();
        this.myListingsCount.set(data.length);
      } else {
        data = await this.socialService.getListings(
          this.searchTerm,
          this.filterCategory,
          this.currentPage,
          20
        );
      }
      if (this.currentPage === 0) {
        this.listings.set(data);
      } else {
        this.listings.update((prev) => [...prev, ...data]);
      }
      this.hasMore.set(data.length === 20);
    } catch {
      this.showToast('Error al cargar productos', 'error');
    }
    this.loading.set(false);
  }

  private async loadMyCount(): Promise<void> {
    try {
      const mine = await this.socialService.getMyListings();
      this.myListingsCount.set(mine.length);
    } catch {}
  }

  onSearchChange(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.currentPage = 0;
      this.load();
    }, 400);
  }

  onCategoryChange(): void {
    this.currentPage = 0;
    this.load();
  }

  toggleMine(): void {
    this.showMine = !this.showMine;
    this.currentPage = 0;
    this.load();
  }

  loadMore(): void {
    this.currentPage++;
    this.load();
  }

  // ============================================================
  // CREATE / EDIT MODAL
  // ============================================================

  readonly MAX_LISTINGS = 3;
  myListingsCount = signal(0);

  async openCreate(): Promise<void> {
    try {
      const mine = await this.socialService.getMyListings();
      this.myListingsCount.set(mine.length);
      if (mine.length >= this.MAX_LISTINGS) {
        this.showToast(`Maximo ${this.MAX_LISTINGS} publicaciones por usuario`, 'error');
        return;
      }
    } catch {
      this.showToast('Error al verificar limite', 'error');
      return;
    }
    this.resetForm();
    this.modalMode.set('create');
  }

  openEdit(listing: MarketplaceListing, event: Event): void {
    event.stopPropagation();
    this.editingListing.set(listing);
    this.formTitle = listing.title;
    this.formDescription = listing.description ?? '';
    this.formPrice = listing.price;
    this.formCategory = listing.category;
    this.formTags = [...listing.tags];
    this.formImages = [...listing.images];
    this.formContactLink = listing.contact_link ?? '';
    this.modalMode.set('edit');
  }

  closeModal(): void {
    this.modalMode.set(null);
    this.editingListing.set(null);
  }

  private resetForm(): void {
    this.formTitle = '';
    this.formDescription = '';
    this.formPrice = null;
    this.formCategory = '';
    this.formTags = [];
    this.formTagInput = '';
    this.formImages = [];
    this.formContactLink = '';
  }

  addTag(): void {
    const tag = this.formTagInput.trim();
    if (tag && !this.formTags.includes(tag) && this.formTags.length < 10) {
      this.formTags = [...this.formTags, tag];
      this.formTagInput = '';
    }
  }

  onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addTag();
    }
  }

  removeTag(index: number): void {
    this.formTags = this.formTags.filter((_, i) => i !== index);
  }

  async onImageDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files) await this.handleFiles(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  async onFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files) await this.handleFiles(input.files);
    input.value = '';
  }

  private async handleFiles(files: FileList): Promise<void> {
    if (this.formImages.length >= 5) {
      this.showToast('Maximo 5 imagenes', 'error');
      return;
    }

    this.uploadingImage.set(true);
    for (let i = 0; i < files.length && this.formImages.length < 5; i++) {
      const file = files[i];
      if (!this.storageService.isValidImage(file)) {
        this.showToast('Formato no valido: ' + file.name, 'error');
        continue;
      }
      if (!this.storageService.isValidSize(file, 5)) {
        this.showToast('Imagen muy grande (max 5MB)', 'error');
        continue;
      }
      const result = await this.storageService.uploadMarketplaceImage(file);
      if (result.success && result.url) {
        this.formImages = [...this.formImages, result.url];
      } else {
        this.showToast(result.error || 'Error al subir imagen', 'error');
      }
    }
    this.uploadingImage.set(false);
  }

  removeImage(index: number): void {
    this.formImages = this.formImages.filter((_, i) => i !== index);
  }

  async saveForm(): Promise<void> {
    if (!this.formTitle.trim() || !this.formCategory) return;

    this.saving.set(true);
    try {
      const payload: CreateListingData = {
        title: this.formTitle.trim(),
        description: this.formDescription.trim() || undefined,
        price: this.formPrice,
        currency: 'COP',
        category: this.formCategory,
        tags: this.formTags,
        images: this.formImages,
        contact_link: this.formContactLink.trim() || undefined,
      };

      if (this.modalMode() === 'create') {
        await this.socialService.createListing(payload);
        this.showToast('Producto publicado', 'success');
      } else {
        const id = this.editingListing()?.id;
        if (id) {
          await this.socialService.updateListing(id, payload as UpdateListingData);
          this.showToast('Producto actualizado', 'success');
        }
      }
      this.closeModal();
      this.currentPage = 0;
      await this.load();
      await this.loadMyCount();
    } catch {
      this.showToast('Error al guardar', 'error');
    }
    this.saving.set(false);
  }

  // ============================================================
  // STATUS / DELETE
  // ============================================================

  async togglePause(listing: MarketplaceListing, event: Event): Promise<void> {
    event.stopPropagation();
    this.actionLoading.set(listing.id);
    try {
      const newStatus: ListingStatus = listing.status === 'active' ? 'paused' : 'active';
      await this.socialService.updateListing(listing.id, { status: newStatus });
      this.listings.update((items) =>
        items.map((l) => (l.id === listing.id ? { ...l, status: newStatus } : l))
      );
      this.showToast(newStatus === 'paused' ? 'Producto pausado' : 'Producto activado', 'success');
    } catch {
      this.showToast('Error al cambiar estado', 'error');
    }
    this.actionLoading.set(null);
  }

  async markSold(listing: MarketplaceListing, event: Event): Promise<void> {
    event.stopPropagation();
    this.actionLoading.set(listing.id);
    try {
      await this.socialService.updateListing(listing.id, { status: 'sold' });
      this.listings.update((items) =>
        items.map((l) => (l.id === listing.id ? { ...l, status: 'sold' as ListingStatus } : l))
      );
      this.showToast('Marcado como vendido', 'success');
    } catch {
      this.showToast('Error al marcar como vendido', 'error');
    }
    this.actionLoading.set(null);
  }

  confirmDelete(id: string, event: Event): void {
    event.stopPropagation();
    this.deletingId.set(id);
  }

  cancelDelete(): void {
    this.deletingId.set(null);
  }

  async deleteListing(): Promise<void> {
    const id = this.deletingId();
    if (!id) return;
    this.actionLoading.set(id);
    try {
      await this.socialService.deleteListing(id);
      this.listings.update((items) => items.filter((l) => l.id !== id));
      this.myListingsCount.update((c) => Math.max(0, c - 1));
      this.showToast('Producto eliminado', 'success');
    } catch {
      this.showToast('Error al eliminar', 'error');
    }
    this.deletingId.set(null);
    this.actionLoading.set(null);
  }

  // ============================================================
  // DETAIL MODAL
  // ============================================================

  openDetail(listing: MarketplaceListing): void {
    this.detailListing.set(listing);
    this.carouselIndex.set(0);
  }

  closeDetail(): void {
    this.detailListing.set(null);
  }

  prevImage(): void {
    const images = this.detailListing()?.images ?? [];
    this.carouselIndex.update((i) => (i > 0 ? i - 1 : images.length - 1));
  }

  nextImage(): void {
    const images = this.detailListing()?.images ?? [];
    this.carouselIndex.update((i) => (i < images.length - 1 ? i + 1 : 0));
  }

  goToImage(index: number): void {
    this.carouselIndex.set(index);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  isOwner(listing: MarketplaceListing): boolean {
    return listing.user_id === this.profile()?.id;
  }

  getSellerInitials(listing: MarketplaceListing): string {
    const name = listing.seller?.full_name || listing.seller?.username || '?';
    return name.slice(0, 2).toUpperCase();
  }

  formatPrice(listing: MarketplaceListing): string {
    if (listing.price == null) return 'Consultar';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: listing.currency || 'COP',
      maximumFractionDigits: 0,
    }).format(listing.price);
  }

  getStatusBadge(status: ListingStatus): { label: string; class: string } {
    switch (status) {
      case 'active':
        return { label: 'Activo', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'paused':
        return { label: 'Pausado', class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'sold':
        return { label: 'Vendido', class: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    }
  }

  goToSeller(listing: MarketplaceListing, event: Event): void {
    event.stopPropagation();
    if (listing.seller?.username) {
      this.closeDetail();
      this.router.navigate(['/social', listing.seller.username]);
    }
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toast.set({ msg, type });
    setTimeout(() => this.toast.set(null), 3000);
  }
}
