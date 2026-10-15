-- Сохраняем ранее существовавшие настройки; новые начальные строки не считаем
-- явно выбранной настройкой до первого PUT или импорта.
ALTER TABLE health.settings ADD COLUMN visibility_defined boolean NOT NULL DEFAULT true;
ALTER TABLE health.settings ALTER COLUMN visibility_defined SET DEFAULT false;
