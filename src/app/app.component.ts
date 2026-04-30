import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ImageStudioComponent } from './image-studio.component';
import { ResultsDesignComponent } from './results-design.component';

type ModuleStatus = 'Activo' | 'Próximamente' | 'En diseño';
type ModuleId =
  | 'image-studio'
  | 'resultados-diseno'
  | 'brand-kit'
  | 'assets'
  | 'prompt-lab'
  | 'ui-review'
  | 'motion-board'
  | 'sistema';

type DashboardModule = {
  id: ModuleId;
  name: string;
  subtitle: string;
  description: string;
  status: ModuleStatus;
  icon: string;
  accent: string;
  metric: string;
  updatedLabel: string;
};

const dashboardModules: DashboardModule[] = [
  {
    id: 'image-studio',
    name: 'Image Studio',
    subtitle: 'Generación visual',
    description: 'Crea imágenes, conceptos y variaciones desde prompts con un flujo claro.',
    status: 'Activo',
    icon: '✨',
    accent: 'from-violet-100 via-white to-orange-50',
    metric: 'Módulo 01',
    updatedLabel: 'Disponible ahora',
  },
  {
    id: 'resultados-diseno',
    name: 'Resultados de diseño',
    subtitle: 'Entregables visuales',
    description: 'Dashboard de métricas por persona con carga de Excel, filtros e historial mensual.',
    status: 'Activo',
    icon: '📁',
    accent: 'from-sky-100 via-white to-indigo-50',
    metric: 'Módulo 02',
    updatedLabel: 'Disponible ahora',
  },
  {
    id: 'brand-kit',
    name: 'Brand Kit',
    subtitle: 'Sistema de marca',
    description: 'Centraliza logos, colores, tipografías y lineamientos visuales del producto.',
    status: 'En diseño',
    icon: '🎨',
    accent: 'from-pink-100 via-white to-rose-50',
    metric: 'Tokens visuales',
    updatedLabel: 'Pendiente de poblar',
  },
  {
    id: 'assets',
    name: 'Assets',
    subtitle: 'Recursos del sistema',
    description: 'Agrupa íconos, mockups, plantillas y piezas reutilizables para producción.',
    status: 'En diseño',
    icon: '🧩',
    accent: 'from-amber-100 via-white to-orange-50',
    metric: 'Biblioteca base',
    updatedLabel: 'Pendiente de poblar',
  },
  {
    id: 'prompt-lab',
    name: 'Prompt Lab',
    subtitle: 'Exploración creativa',
    description: 'Prueba direcciones visuales, variantes de copy y recetas reutilizables de prompts.',
    status: 'Próximamente',
    icon: '🧪',
    accent: 'from-emerald-100 via-white to-teal-50',
    metric: 'Laboratorio',
    updatedLabel: 'Próxima iteración',
  },
  {
    id: 'ui-review',
    name: 'UI Review',
    subtitle: 'Control de interfaces',
    description: 'Reserva este módulo para auditorías UX/UI, feedback y control de consistencia.',
    status: 'En diseño',
    icon: '🖥️',
    accent: 'from-slate-100 via-white to-zinc-50',
    metric: 'Checklist UX',
    updatedLabel: 'Pendiente de poblar',
  },
  {
    id: 'motion-board',
    name: 'Motion Board',
    subtitle: 'Animación y presentación',
    description: 'Ideal para futuras transiciones, microinteracciones y direction visual animada.',
    status: 'Próximamente',
    icon: '🎬',
    accent: 'from-fuchsia-100 via-white to-violet-50',
    metric: 'Storyboard',
    updatedLabel: 'Próxima iteración',
  },
  {
    id: 'sistema',
    name: 'Sistema',
    subtitle: 'Configuración general',
    description: 'Ubica aquí ajustes globales, proveedores, estados de módulos y preferencias.',
    status: 'En diseño',
    icon: '⚙️',
    accent: 'from-cyan-100 via-white to-slate-50',
    metric: 'Control central',
    updatedLabel: 'Pendiente de poblar',
  },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ImageStudioComponent, ResultsDesignComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly modules = dashboardModules;
  activeModule: ModuleId = 'sistema';
  currentView: 'dashboard' | 'image-studio' | 'resultados-diseno' = 'dashboard';

  get activeModuleData() {
    return this.modules.find((module) => module.id === this.activeModule) ?? this.modules[0];
  }

  get activeModuleCount() {
    return this.modules.length;
  }

  get activeStatusCount() {
    return this.modules.filter((module) => module.status === 'Activo').length;
  }

  moduleStatusClasses(status: ModuleStatus) {
    switch (status) {
      case 'Activo':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      case 'Próximamente':
        return 'border-amber-200 bg-amber-50 text-amber-700';
      default:
        return 'border-slate-200 bg-slate-100 text-slate-600';
    }
  }

  moduleCardClasses(moduleId: ModuleId) {
    return this.activeModule === moduleId
      ? 'border-slate-950 bg-slate-950 text-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]'
      : 'border border-white/70 bg-white/85 text-slate-900 shadow-[0_10px_40px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-[0_18px_45px_rgba(15,23,42,0.1)]';
  }

  openModule(moduleId: ModuleId) {
    this.activeModule = moduleId;

    if (moduleId === 'image-studio') {
      this.currentView = 'image-studio';
      return;
    }

    if (moduleId === 'resultados-diseno') {
      this.currentView = 'resultados-diseno';
      return;
    }

    this.currentView = 'dashboard';
  }

  backToDashboard() {
    this.currentView = 'dashboard';
    this.activeModule = 'sistema';
  }
}
