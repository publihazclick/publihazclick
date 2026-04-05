import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dinamicas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dinamicas.component.html',
  styleUrl: './dinamicas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DinamicasComponent {}
