import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface SocialLink {
  name: string;
  icon: string;
  href: string;
}

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  protected readonly currentYear = new Date().getFullYear();
  
  protected readonly socialLinks: SocialLink[] = [
    { name: 'Facebook', icon: 'facebook', href: '#' },
    { name: 'Instagram', icon: 'photo_camera', href: '#' },
    { name: 'Twitter', icon: 'tag', href: '#' },
    { name: 'YouTube', icon: 'smart_display', href: '#' }
  ];
}
