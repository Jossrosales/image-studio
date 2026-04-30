import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { firstValueFrom } from 'rxjs';

type DesignResultEntry = {
  id: string;
  person: string;
  month: string;
  startDate: string | null;
  endDate: string | null;
  completedDate: string | null;
  storyPoints: number;
  completedTasks: number;
  lateTasks: number;
  tags: string[];
  sourceRow: number;
};

type UploadMode = 'replace' | 'merge';
type UploadHistoryItem = {
  id: string;
  fileName: string;
  uploadedAt: string;
  mode: UploadMode;
  entryCount: number;
};

type DesignResultsResponse = {
  entries: DesignResultEntry[];
  uploadedFileName: string | null;
  uploadedAt: string | null;
  uploads: UploadHistoryItem[];
};

type DesignResultsSavePayload = {
  entries: DesignResultEntry[];
  fileName: string;
  uploadedAt: string;
  mode: UploadMode;
};

type ParsedRow = Record<string, unknown>;
type MonthOption = { value: number; label: string };
type PeriodSummary = {
  monthLabel: string;
  storyPoints: number;
  completedTasks: number;
  lateTasks: number;
  tags: number;
  tasks: number;
};

const headerAliases = {
  person: ['persona', 'nombre', 'name', 'responsable', 'assignee', 'owner', 'colaborador'],
  startDate: ['fecha inicio', 'inicio', 'start date', 'start'],
  endDate: ['fecha fin', 'fin', 'end date', 'due date', 'deadline'],
  completedDate: ['fecha completada', 'completada', 'completed date', 'completion date', 'done date', 'fecha de completado'],
  storyPoints: ['story points', 'storypoints', 'points', 'puntos', 'sp'],
  tags: ['tags', 'tag', 'tipo de tags', 'tipo tags', 'categorias', 'categorías', 'labels'],
} as const;
const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long' });
const monthYearFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value ?? '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.(?=.*\.)/g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number' && value > 0) {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return new Date(date.y, date.m - 1, date.d);
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const normalized = raw.includes('/') && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)
    ? (() => {
        const [first, second, year] = raw.split('/').map(Number);
        return new Date(year < 100 ? 2000 + year : year, second - 1, first);
      })()
    : new Date(raw);

  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function toIsoDate(value: unknown) {
  const date = parseExcelDate(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString() : null;
}

function toMonthLabel(value: unknown) {
  const date = parseExcelDate(value);
  if (date) return monthYearFormatter.format(date);
  const raw = String(value ?? '').trim();
  return raw || 'Sin mes';
}

function splitTags(value: unknown) {
  return String(value ?? '')
    .split(/[,;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createId() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getReferenceDate(entry: DesignResultEntry) {
  return entry.completedDate ?? entry.endDate ?? entry.startDate;
}

@Component({
  selector: 'app-results-design',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './results-design.component.html',
})
export class ResultsDesignComponent {
  @Output() back = new EventEmitter<void>();

  private readonly http = inject(HttpClient);

  entries: DesignResultEntry[] = [];
  uploads: UploadHistoryItem[] = [];
  selectedPerson = 'all';
  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();
  uploadMode: UploadMode = 'merge';
  uploadedFileName: string | null = null;
  uploadedAt: string | null = null;
  dragActive = false;
  loading = true;
  saving = false;
  notice: string | null = null;
  error: string | null = null;

  constructor() {
    void this.loadStoredResults();
  }

  get people() {
    return Array.from(new Set(this.entries.map((entry) => entry.person))).sort((a, b) => a.localeCompare(b));
  }

  get filteredEntries() {
    return this.selectedPerson === 'all'
      ? this.entries
      : this.entries.filter((entry) => entry.person === this.selectedPerson);
  }

  get totalStoryPoints() {
    return this.filteredEntries.reduce((sum, entry) => sum + entry.storyPoints, 0);
  }

  get totalCompletedTasks() {
    return this.filteredEntries.reduce((sum, entry) => sum + entry.completedTasks, 0);
  }

  get totalLateTasks() {
    return this.filteredEntries.reduce((sum, entry) => sum + entry.lateTasks, 0);
  }

  get currentPersonLabel() {
    return this.selectedPerson === 'all' ? 'Todo el equipo' : this.selectedPerson;
  }

  get tagSummary() {
    const tags = new Map<string, number>();
    for (const entry of this.filteredEntries) {
      for (const tag of entry.tags) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(tags.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  get monthOptions(): MonthOption[] {
    return Array.from({ length: 12 }, (_, index) => {
      const value = index + 1;
      return { value, label: monthFormatter.format(new Date(2026, index, 1)) };
    });
  }

  get availableYears() {
    const years = new Set<number>();
    for (const entry of this.filteredEntries) {
      const reference = getReferenceDate(entry);
      if (!reference) continue;
      const date = new Date(reference);
      if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
    }

    if (!years.size) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }

  get periodFilteredEntries() {
    return this.filteredEntries.filter((entry) => {
      const reference = getReferenceDate(entry);
      if (!reference) return false;
      const date = new Date(reference);
      return !Number.isNaN(date.getTime())
        && date.getMonth() + 1 === this.selectedMonth
        && date.getFullYear() === this.selectedYear;
    });
  }

  get periodSummary(): PeriodSummary | null {
    if (!this.periodFilteredEntries.length) return null;
    return {
      monthLabel: monthYearFormatter.format(new Date(this.selectedYear, this.selectedMonth - 1, 1)),
      storyPoints: this.periodFilteredEntries.reduce((sum, entry) => sum + entry.storyPoints, 0),
      completedTasks: this.periodFilteredEntries.reduce((sum, entry) => sum + entry.completedTasks, 0),
      lateTasks: this.periodFilteredEntries.reduce((sum, entry) => sum + entry.lateTasks, 0),
      tags: this.periodFilteredEntries.reduce((sum, entry) => sum + entry.tags.length, 0),
      tasks: this.periodFilteredEntries.length,
    };
  }

  get topPerformer() {
    const grouped = new Map<string, number>();
    for (const entry of this.entries) {
      grouped.set(entry.person, (grouped.get(entry.person) ?? 0) + entry.storyPoints);
    }
    const sorted = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { person: sorted[0][0], points: sorted[0][1] } : null;
  }

  get statsCards() {
    return [
      { label: 'Story points', value: this.totalStoryPoints, note: 'Total acumulado en el filtro actual' },
      { label: 'Tareas realizadas', value: this.totalCompletedTasks, note: 'Se cuenta 1 por fila con fecha completada' },
      { label: 'Fuera de tiempo', value: this.totalLateTasks, note: 'Fecha completada posterior a fecha fin' },
      { label: 'Tipos de tags', value: this.tagSummary.length, note: 'Categorías detectadas' },
    ];
  }

  get totalUploads() {
    return this.uploads.length;
  }

  get lastUploadModeLabel() {
    return this.uploadMode === 'merge' ? 'Combinar' : 'Reemplazar';
  }

  getPersonEntryCount(person: string) {
    return this.entries.filter((entry) => entry.person === person).length;
  }

  onPersonChange(person: string) {
    this.selectedPerson = person;
    this.syncSelectedPeriod();
    this.notice = `Filtro aplicado: ${person === 'all' ? 'Todo el equipo' : person}.`;
  }

  onMonthChange(month: number) {
    this.selectedMonth = Number(month);
    this.notice = `Mes seleccionado: ${monthFormatter.format(new Date(this.selectedYear, this.selectedMonth - 1, 1))}.`;
  }

  onYearChange(year: number) {
    this.selectedYear = Number(year);
    this.notice = `Año seleccionado: ${this.selectedYear}.`;
  }

  onUploadModeChange(mode: UploadMode) {
    this.uploadMode = mode;
    this.notice = mode === 'merge'
      ? 'El próximo Excel se combinará con el historial existente.'
      : 'El próximo Excel reemplazará todo el historial existente.';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragActive = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.dragActive = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragActive = false;
    void this.processFile(event.dataTransfer?.files?.[0] ?? null);
  }

  onFileInput(event: Event) {
    void this.processFile((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  async clearData() {
    this.error = null;
    this.notice = null;
    this.saving = true;

    try {
      await firstValueFrom(this.http.delete<{ ok: boolean }>('/api/design-results'));
      this.entries = [];
      this.uploads = [];
      this.selectedPerson = 'all';
      this.selectedMonth = new Date().getMonth() + 1;
      this.selectedYear = new Date().getFullYear();
      this.uploadedFileName = null;
      this.uploadedAt = null;
      this.notice = 'Historial completo eliminado del servidor.';
    } catch (error: unknown) {
      this.error = this.extractErrorMessage(error, 'No pude limpiar el historial guardado.');
    } finally {
      this.saving = false;
    }
  }

  async processFile(file: File | null) {
    if (!file) return;
    this.error = null;
    this.notice = null;
    this.saving = true;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });

      if (!rows.length) {
        throw new Error('El Excel llegó vacío o sin filas útiles.');
      }

      const nextEntries: DesignResultEntry[] = rows
        .map((row: ParsedRow, index: number) => this.mapRowToEntry(row, index))
        .filter((entry: DesignResultEntry | null): entry is DesignResultEntry => entry !== null);

      if (!nextEntries.length) {
        throw new Error('No pude mapear columnas válidas. Ahora necesito: fecha inicio, fecha fin, persona, fecha completada, tags y story points.');
      }

      const payload: DesignResultsSavePayload = {
        entries: nextEntries,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        mode: this.uploadMode,
      };

      await firstValueFrom(this.http.post('/api/design-results', payload));
      await this.loadStoredResults();
      this.notice = this.uploadMode === 'merge'
        ? `${nextEntries.length} registros combinados y guardados desde ${file.name}.`
        : `${nextEntries.length} registros guardados reemplazando el historial con ${file.name}.`;
    } catch (error: unknown) {
      this.error = this.extractErrorMessage(error, 'No pude leer o guardar el Excel.');
    } finally {
      this.saving = false;
    }
  }

  private async loadStoredResults() {
    this.loading = true;
    this.error = null;

    try {
      const stored = await firstValueFrom(this.http.get<DesignResultsResponse>('/api/design-results'));
      this.entries = stored.entries ?? [];
      this.uploads = stored.uploads ?? [];
      this.uploadedFileName = stored.uploadedFileName;
      this.uploadedAt = stored.uploadedAt;
      this.syncSelectedPeriod();
    } catch (error: unknown) {
      this.error = this.extractErrorMessage(error, 'No pude cargar el historial guardado.');
    } finally {
      this.loading = false;
    }
  }

  private syncSelectedPeriod() {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const hasCurrentPeriod = this.filteredEntries.some((entry) => {
      const reference = getReferenceDate(entry);
      if (!reference) return false;
      const date = new Date(reference);
      return !Number.isNaN(date.getTime()) && date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear;
    });

    if (hasCurrentPeriod) {
      this.selectedMonth = currentMonth;
      this.selectedYear = currentYear;
      return;
    }

    const firstReference = this.filteredEntries
      .map((entry) => getReferenceDate(entry))
      .find((value) => Boolean(value));

    if (!firstReference) return;
    const date = new Date(firstReference);
    if (Number.isNaN(date.getTime())) return;
    this.selectedMonth = date.getMonth() + 1;
    this.selectedYear = date.getFullYear();
  }

  private extractErrorMessage(error: unknown, fallback: string) {
    const apiError = typeof error === 'object' && error && 'error' in error
      ? (error as { error?: { error?: string } }).error?.error
      : null;
    return apiError ?? (error instanceof Error ? error.message : fallback);
  }

  private mapRowToEntry(row: ParsedRow, index: number): DesignResultEntry | null {
    const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);
    const getByAlias = (aliases: readonly string[]) => normalizedEntries.find(([key]) => aliases.includes(key))?.[1];

    const person = String(getByAlias(headerAliases.person) ?? '').trim();
    const startDate = toIsoDate(getByAlias(headerAliases.startDate));
    const endDate = toIsoDate(getByAlias(headerAliases.endDate));
    const completedDate = toIsoDate(getByAlias(headerAliases.completedDate));
    const storyPoints = toNumber(getByAlias(headerAliases.storyPoints));
    const tags = splitTags(getByAlias(headerAliases.tags));
    const completedTasks = completedDate ? 1 : 0;
    const lateTasks = completedDate && endDate && new Date(completedDate).getTime() > new Date(endDate).getTime() ? 1 : 0;
    const month = toMonthLabel(completedDate ?? endDate ?? startDate);

    if (!person) return null;
    if (!startDate && !endDate && !completedDate && !storyPoints && !tags.length) return null;

    return {
      id: createId(),
      person,
      month,
      startDate,
      endDate,
      completedDate,
      storyPoints,
      completedTasks,
      lateTasks,
      tags,
      sourceRow: index + 2,
    };
  }
}
