import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Post {
  id: number;
  store: string;
  image: string;
  title: string;
  description: string;
  promo: string;
  overlayText: string;
}

@Component({
  selector: 'app-recent-posts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recent-posts.component.html',
  styleUrl: './recent-posts.component.scss'
})
export class RecentPostsComponent {
  protected readonly message = signal('');

  protected readonly posts: Post[] = [
    {
      id: 1,
      store: 'Mileniustore',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA2RWuxdN5hyuEP7KMGu55VJWKBi_9LXMmpdJPiCTvKE5h57afgm-EAs_NdT7nn-rxG6c-T5OOdkoJBv1KTYm0Zza-I1bz8qutiJeCeV0Xue93aP_IiPEoOnKH4VzKWvD1VGrlgXbE25kFP_yB8zNBFIkUCbJkjazLUMduxnwHh6aCnxKWrfF6tFjRCuMVIlvqdQBSHNKL5XOnOsYknRnjMiFlUDrKoqnbTXz3DFUOYIuKxSc78ZbZSjX_IpLDhA9XPv75XSdH7X5vk',
      title: 'Promo Helados Mimos',
      description: 'Este martes no te pierdas la variedad de combos helado no te lo pierdas.',
      promo: 'Todos Los Martes 2x1',
      overlayText: 'DULCURA Y FELICIDAD'
    },
    {
      id: 2,
      store: 'Mileniustore',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA2RWuxdN5hyuEP7KMGu55VJWKBi_9LXMmpdJPiCTvKE5h57afgm-EAs_NdT7nn-rxG6c-T5OOdkoJBv1KTYm0Zza-I1bz8qutiJeCeV0Xue93aP_IiPEoOnKH4VzKWvD1VGrlgXbE25kFP_yB8zNBFIkUCbJkjazLUMduxnwHh6aCnxKWrfF6tFjRCuMVIlvqdQBSHNKL5XOnOsYknRnjMiFlUDrKoqnbTXz3DFUOYIuKxSc78ZbZSjX_IpLDhA9XPv75XSdH7X5vk',
      title: 'Promo Helados Mimos',
      description: 'Este martes no te pierdas la variedad de combos helado no te lo pierdas.',
      promo: 'Todos Los Martes 2x1',
      overlayText: 'SABORES QUE ENAMORAN'
    },
    {
      id: 3,
      store: 'Mileniustore',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA2RWuxdN5hyuEP7KMGu55VJWKBi_9LXMmpdJPiCTvKE5h57afgm-EAs_NdT7nn-rxG6c-T5OOdkoJBv1KTYm0Zza-I1bz8qutiJeCeV0Xue93aP_IiPEoOnKH4VzKWvD1VGrlgXbE25kFP_yB8zNBFIkUCbJkjazLUMduxnwHh6aCnxKWrfF6tFjRCuMVIlvqdQBSHNKL5XOnOsYknRnjMiFlUDrKoqnbTXz3DFUOYIuKxSc78ZbZSjX_IpLDhA9XPv75XSdH7X5vk',
      title: 'Promo Helados Mimos',
      description: 'Este martes no te pierdas la variedad de combos helado no te lo pierdas.',
      promo: 'Todos Los Martes 2x1',
      overlayText: 'EL MEJOR MOMENTO'
    }
  ];

  sendMessage(postId: number): void {
    console.log('Sending message for post:', postId, 'Message:', this.message());
    alert('¡Mensaje enviado!');
    this.message.set('');
  }
}
