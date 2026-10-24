// ============================================================
// 1. КАРТА
// ============================================================
const map = L.map('map').setView([48.0, 20.0], 3);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// ============================================================
// 2. ХРАНИЛИЩЕ (localStorage)
// ============================================================
const STORAGE_KEY = 'travel_places_v1';

// Загружаем массив мест из localStorage
function loadPlaces() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('Ошибка чтения localStorage', e);
        return [];
    }
}

// Сохраняем массив мест
function savePlaces(places) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    } catch (e) {
        // Самая частая причина — переполнение localStorage из-за фото
        alert('Не удалось сохранить данные. Возможно, фото слишком большое или закончилось место в браузере. Попробуй фото поменьше.');
        console.error('Ошибка записи localStorage', e);
        throw e;
    }
}

let places = loadPlaces();

// ============================================================
// 3. СЖАТИЕ ФОТО (чтобы не переполнить localStorage)
// ============================================================
// Принимает File, возвращает Promise<string> (dataURL сжатого JPEG)
function compressImage(file, maxSize = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > height && width > maxSize) {
                    height = Math.round(height * maxSize / width);
                    width = maxSize;
                } else if (height > maxSize) {
                    width = Math.round(width * maxSize / height);
                    height = maxSize;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================================
// 4. ОТРИСОВКА ВСЕХ МЕТОК
// ============================================================
let markersLayer = L.layerGroup().addTo(map);

function renderMarkers() {
    markersLayer.clearLayers();
    places.forEach((place) => {
        const marker = L.marker([place.lat, place.lng]).addTo(markersLayer);

        let popupHtml = `<b>${escapeHtml(place.name)}</b>`;
        if (place.description) {
            popupHtml += `<br><small>${escapeHtml(place.description)}</small>`;
        }
        if (place.photo) {
            popupHtml += `<img src="${place.photo}" class="photo-popup" alt="фото">`;
        }
        popupHtml += `<br><button class="delete-btn" data-id="${place.id}">Удалить</button>`;

        marker.bindPopup(popupHtml);

        // Обработчик удаления — навесим после открытия попапа
        marker.on('popupopen', (e) => {
            const btn = e.popup.getElement().querySelector('.delete-btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    deletePlace(place.id);
                });
            }
        });
    });
}

function deletePlace(id) {
    if (!confirm('Удалить это место?')) return;
    places = places.filter((p) => p.id !== id);
    savePlaces(places);
    renderMarkers();
}

// ============================================================
// 5. ДОБАВЛЕНИЕ МЕСТА
// ============================================================
let pendingMarker = null;
let pendingLatLng = null;

map.on('click', (e) => {
    if (pendingMarker) map.removeLayer(pendingMarker);
    pendingLatLng = e.latlng;
    pendingMarker = L.marker(e.latlng).addTo(map);
    pendingMarker
        .bindPopup('Новое место. Заполни поля справа и нажми «Добавить»')
        .openPopup();
    document.getElementById('status').textContent =
        `Выбрано: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
});

document.getElementById('addBtn').addEventListener('click', async function () {
    const name = document.getElementById('placeName').value.trim();
    const desc = document.getElementById('placeDesc').value.trim();
    const photoFile = document.getElementById('placePhoto').files[0];
    const statusEl = document.getElementById('status');
    const btn = this;

    if (!name) {
        alert('Введи название места');
        return;
    }
    if (!pendingLatLng) {
        alert('Кликни по карте, чтобы выбрать место');
        return;
    }

    btn.disabled = true;
    statusEl.textContent = 'Обработка...';

    try {
        let photoData = '';
        if (photoFile) {
            statusEl.textContent = 'Сжатие фото...';
            photoData = await compressImage(photoFile);
        }

        const newPlace = {
            id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            name,
            description: desc,
            lat: pendingLatLng.lat,
            lng: pendingLatLng.lng,
            photo: photoData,
            createdAt: Date.now()
        };

        places.push(newPlace);
        savePlaces(places);
        renderMarkers();

        // Очистка формы
        document.getElementById('placeName').value = '';
        document.getElementById('placeDesc').value = '';
        document.getElementById('placePhoto').value = '';
        if (pendingMarker) {
            map.removeLayer(pendingMarker);
            pendingMarker = null;
            pendingLatLng = null;
        }
        statusEl.textContent = 'Место добавлено!';
        setTimeout(() => {
            if (statusEl.textContent === 'Место добавлено!') statusEl.textContent = '';
        }, 2000);
    } catch (e) {
        console.error(e);
        statusEl.textContent = 'Ошибка: ' + e.message;
    } finally {
        btn.disabled = false;
    }
});

// ============================================================
// 6. ЭКСПОРТ / ИМПОРТ РЕЗЕРВНОЙ КОПИИ
// ============================================================
document.getElementById('exportBtn').addEventListener('click', () => {
    const dataStr = JSON.stringify(places, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `travel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) throw new Error('Неверный формат файла');
        if (places.length > 0) {
            if (!confirm('У тебя уже есть места на карте. Заменить их импортированными?')) return;
        }
        places = imported;
        savePlaces(places);
        renderMarkers();
        alert(`Импортировано мест: ${imported.length}`);
    } catch (err) {
        alert('Не удалось импортировать: ' + err.message);
    } finally {
        e.target.value = '';
    }
});

// ============================================================
// 7. УТИЛИТЫ
// ============================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// 8. СТАРТ
// ============================================================
renderMarkers();
