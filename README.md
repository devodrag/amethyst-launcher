# ◈ Amethyst Launcher

> Minecraft лаунчер с фиолетовой темой, glassmorphism UI и автоматической подпиской на серверы GodBox.

---

## Структура файлов

```
amethyst-launcher/
├── main.js        ← Electron главный процесс (IPC, launch, NBT)
├── preload.js     ← Безопасный мост renderer ↔ Node.js
├── index.html     ← UI (Tailwind CDN + кастомный CSS)
├── renderer.js    ← Модульная логика UI (6 модулей)
├── package.json   ← Зависимости и сборка
└── assets/        ← Иконки (создайте папку вручную)
    └── icon.png
```

---

## Быстрый старт

### 1. Установи Node.js
Скачай LTS с [nodejs.org](https://nodejs.org) и установи.

### 2. Установи Java 17+
Скачай с [adoptium.net](https://adoptium.net) — нужна для запуска Minecraft.

### 3. Установи зависимости

Открой терминал/PowerShell в папке `amethyst-launcher/` и выполни:

```bash
npm install
```

### 4. Запусти лаунчер

```bash
npm start
```

---

## Использование

1. **Выбери тип загрузчика** — Vanilla / Fabric / Forge / NeoForge / Quilt
2. **Выбери версию** — список загружается с серверов Mojang автоматически
3. **Введи никнейм** (поле справа от кнопки ЗАПУСК)
4. Нажми **ЗАПУСК**

При первом запуске Minecraft скачает нужные файлы (~300–500 МБ).

---

## Что происходит при нажатии ЗАПУСК

1. Лаунчер читает `servers.dat` через `prismarine-nbt`
2. Автоматически добавляет `godbox.pw` и `eu.godbox.pw` если их нет
3. Записывает обновлённый `servers.dat`
4. Запускает Minecraft через `minecraft-launcher-core`

---

## Настройки

| Параметр | По умолчанию | Описание |
|---|---|---|
| RAM | 2 ГБ | Слайдер до максимума системы − 1 ГБ |
| Разрешение | 1280×720 | Или полноэкранный режим |
| JVM аргументы | G1GC оптимизация | Можно отключить тоглом |

---

## Сборка в .exe / AppImage

```bash
npm run build:win    # Windows NSIS installer
npm run build:linux  # Linux AppImage
npm run build:mac    # macOS DMG
```

Готовые файлы появятся в папке `dist/`.

---

## Частые проблемы

**Лаунчер не запускается / белый экран**
→ Подожди 5–10 секунд при первом старте

**Java не найдена**
→ Установи Java 17+ с [adoptium.net](https://adoptium.net) и перезапусти лаунчер

**npm: command not found**
→ Установи Node.js с [nodejs.org](https://nodejs.org)

**Версии не загружаются**
→ Проверь интернет-соединение. Лаунчер использует `launchermeta.mojang.com`
