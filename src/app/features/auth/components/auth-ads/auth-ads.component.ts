import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminBannerService } from '../../../../core/services/admin-banner.service';
import type { BannerAd } from '../../../../core/models/admin.model';

interface CardData {
  name: string;
  description: string;
  imageUrl: string;
  url: string;
}

@Component({
  selector: 'app-auth-ads',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth-ads.component.html',
  styleUrl: './auth-ads.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthAdsComponent implements OnInit {
  private readonly bannerService = inject(AdminBannerService);

  readonly banners = signal<BannerAd[]>([]);
  readonly loading = signal<boolean>(true);

  private readonly fallbackCards: CardData[] = [
    {
      name: 'Discover Scoopfest - Your Ultimate Ice Cream Destination!',
      description:
        "Treat yourself to a creamy paradise with ScoopFest's premium, handcrafted flavors.",
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuA0WeQTpkugOS7_CCczyM584jq58rcNj65NCluWytQotMBuLu6fx3RI-lidLTSWDCvl8CcblPJK1kh-9NonPuqS6CHJsHI8_Mt7aYrd9cx1akPZZhXZSZNGzbSDe1HeoJD3F6xqVhzZIsQlu-UGPK2fJ-2tvdwigbYS34x1w4Ldz1UaMYOP_aF-KLMC_9OmIK-8A724J60mde92ckW8oWjI68rb6PxObbAKeppxI933lccsGzxh5m0tfXr4SksP89bwCSJhzpPb3R_D',
      url: ''
    },
    {
      name: 'New Fall Collection',
      description: 'Shop the latest styles this season.',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBG5uPNuqUGTVtSVxVf4WvNu0S0KQQkfQrRdNGHKOyj-FqXb3zJmUhXkL3eHkhDTDiyfuvN0dAXwCy16kYiJ36RHNx-FQt09s-aE4KL4q-ImYbEybLY_kErC-CrtUAF_uGqf0_-F_wxkhVTEDZkLLfU86dkNztXV77nl5xWy8h9tWDsCzvkQ6No0jKhmuv2_QPp5urMKa7BrNhTxQramsVa_bJjnj4DJ1TlSj6qOyw4IHAM_Y9aaxSdmFZ4tpmTVn1Smbr3aA0CiIIg',
      url: ''
    },
    {
      name: 'Hurry Up And Try Our Popular Sets',
      description: 'Order now and get a 15% discount!',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuB9ZQjVrBcdrU4sey8gG0Y7fDzBIFPQjnknCvWFG1yJGWu9IfCZ1--OdJTjWt7ZFq4YAlA-jhNdsM11-KfvyRTDM-wLcrd2zR7fySWmkUy4u04SJvRF65_BNA5u08lnR7lstTtmw6ImhhCaHF7DLLgfT5j2qeDlKMRx4pGDrJmynIRjQNlP6krWrNU5YaUsdgk-hSz-pxJ-f1GAQ6R0vJaQ7tBVAigQiXYtUfB8sDu6X4LC1fSRlT5wX5S13YcJZxtJvTHqHrh2aRZw',
      url: ''
    },
    {
      name: 'Transform your space with timeless elegance and creative vision',
      description:
        'At Elevate Interiors, we specialize in bringing beauty and functionality to your living spaces. We curate captivating interiors that reflect your unique style.',
      imageUrl: '',
      url: ''
    }
  ];

  readonly cards = computed<CardData[]>(() => {
    const b = this.banners();
    return this.fallbackCards.map((fallback, i) =>
      b[i]
        ? {
            name: b[i].name || fallback.name,
            description: b[i].description || fallback.description,
            imageUrl: b[i].image_url || fallback.imageUrl,
            url: b[i].url || ''
          }
        : fallback
    );
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.bannerService.getActiveBannersByLocation('interstitial');
      this.banners.set(result);
    } catch {
      this.banners.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  hasBanner(index: number): boolean {
    return !!this.banners()[index];
  }

  openUrl(url: string): void {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}
