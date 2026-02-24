// --- KONFIGURASI URL APPS SCRIPT ---
// PENTING: Ganti URL di bawah ini dengan URL Web App (Exec) terbaru Anda!
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzX_vVW7xQFa1PkDqSPl9UFgUEZMMiisd12q8NNVDSEhdeXBN90y9vkDb0D49jwuhsxyQ/exec';

// --- STATE APLIKASI ---
let databaseBarang = [], keranjang = [], jenisUnik = [], riwayatTransaksi = []; 
let currentViewedTx = null, editingTxId = null;

// --- STATE DASHBOARD (BARU) ---
let allSoldItems = []; // Menyimpan semua item terjual untuk di-filter
let chartJenisBarang, chartTopProduk; // Instance untuk grafik

// --- INISIALISASI ---
window.onload = () => {
    switchTab('page-input');
    loadDatabase();
};

// --- SISTEM NOTIFIKASI TOAST ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return; 

    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : (type === 'info' ? 'bg-yellow-500' : 'bg-blue-600'));
    
    toast.className = `${bgColor} text-white px-6 py-3 rounded-lg shadow-lg font-medium flex items-center gap-2 toast-enter`;
    toast.innerHTML = `
        ${type === 'success' ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' : ''}
        ${type === 'error' ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>' : ''}
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-enter-active');
    });
    
    setTimeout(() => {
        toast.classList.remove('toast-enter-active');
        toast.classList.add('toast-exit-active');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function toggleLoading(show, text = 'Memuat Data...') {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    if (textEl) textEl.innerText = text;
    
    if(show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
}

// --- NAVIGASI TAB ---
function switchTab(pageId) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.className = "tab-btn px-4 py-2 rounded-md font-semibold text-gray-600 hover:bg-gray-100 transition whitespace-nowrap";
    });
    
    const activeTabId = pageId.replace('page-', 'tab-');
    const activeTab = document.getElementById(activeTabId);
    if(activeTab) {
        activeTab.className = "tab-btn px-4 py-2 rounded-md font-semibold text-blue-600 bg-blue-50 transition whitespace-nowrap";
    }

    // Jika tab dashboard dibuka, muat datanya untuk pertama kali
    if (pageId === 'page-dashboard' && allSoldItems.length === 0) {
        loadDashboardData();
    }
}

// --- FUNGSI-FUNGSI DASHBOARD (BARU) ---

async function loadDashboardData() {
    toggleLoading(true, "Mengambil data dashboard...");
    try {
        const url = `${SCRIPT_URL}?action=getDashboardData&v=${new Date().getTime()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Gagal terhubung ke server");
        
        const result = await response.json();
        if (result.status === 'error') throw new Error(result.message);

        allSoldItems = result.data;
        
        populateDashboardFilters();
        applyDashboardFilters();

    } catch (error) {
        showToast("Gagal memuat dashboard: " + error.message, "error");
    } finally {
        toggleLoading(false);
    }
}

function populateDashboardFilters() {
    const jenisSet = new Set(allSoldItems.map(item => item.jenis));
    const ukuranSet = new Set(allSoldItems.map(item => item.ukuran));

    const filterJenis = document.getElementById('filter-jenis');
    const filterUkuran = document.getElementById('filter-ukuran');

    filterJenis.innerHTML = '<option value="">Semua Jenis</option>';
    jenisSet.forEach(jenis => filterJenis.innerHTML += `<option value="${jenis}">${jenis}</option>`);

    filterUkuran.innerHTML = '<option value="">Semua Ukuran</option>';
    ukuranSet.forEach(ukuran => filterUkuran.innerHTML += `<option value="${ukuran}">${ukuran}</option>`);
}

function applyDashboardFilters() {
    const jenisValue = document.getElementById('filter-jenis').value;
    const ukuranValue = document.getElementById('filter-ukuran').value;
    const pelangganValue = document.getElementById('filter-pelanggan').value.toLowerCase();

    let filteredItems = allSoldItems.filter(item => {
        const jenisMatch = !jenisValue || item.jenis === jenisValue;
        const ukuranMatch = !ukuranValue || item.ukuran === ukuranValue;
        const pelangganMatch = !pelangganValue || item.pelanggan.toLowerCase().includes(pelangganValue);
        return jenisMatch && ukuranMatch && pelangganMatch;
    });

    const summary = {
        totalPendapatan: 0,
        totalBarang: 0,
        produkTerlaris: '-',
        penjualanPerJenis: {},
        penjualanPerProduk: {},
        transaksi: new Set()
    };

    filteredItems.forEach(item => {
        summary.totalPendapatan += item.subtotal;
        summary.totalBarang += item.jml;
        summary.penjualanPerJenis[item.jenis] = (summary.penjualanPerJenis[item.jenis] || 0) + item.subtotal;
        summary.penjualanPerProduk[item.nama] = (summary.penjualanPerProduk[item.nama] || 0) + item.jml;
        summary.transaksi.add(item.pelanggan);
    });
    
    summary.totalTransaksi = summary.transaksi.size;
    const sortedProduk = Object.entries(summary.penjualanPerProduk).sort((a, b) => b[1] - a[1]);
    if (sortedProduk.length > 0) {
        summary.produkTerlaris = sortedProduk[0][0];
    }
    
    renderDashboard(summary);
}

function resetDashboardFilters() {
    document.getElementById('filter-jenis').value = '';
    document.getElementById('filter-ukuran').value = '';
    document.getElementById('filter-pelanggan').value = '';
    applyDashboardFilters();
}

function renderDashboard(summary) {
    document.getElementById('db-total-pendapatan').textContent = `Rp ${summary.totalPendapatan.toLocaleString('id-ID')}`;
    document.getElementById('db-total-barang').textContent = summary.totalBarang.toLocaleString('id-ID');
    document.getElementById('db-total-transaksi').textContent = summary.totalTransaksi.toLocaleString('id-ID');
    document.getElementById('db-produk-terlaris').textContent = summary.produkTerlaris;
    renderChartJenis(summary.penjualanPerJenis);
    renderChartTopProduk(summary.penjualanPerProduk);
}

function getRandomColor() {
    const r = Math.floor(Math.random() * 200);
    const g = Math.floor(Math.random() * 200);
    const b = Math.floor(Math.random() * 200);
    return `rgba(${r}, ${g}, ${b}, 0.7)`;
}

function renderChartJenis(data) {
    const ctx = document.getElementById('chart-jenis-barang').getContext('2d');
    const labels = Object.keys(data);
    const values = Object.values(data);
    const colors = labels.map(() => getRandomColor());

    if (chartJenisBarang) {
        chartJenisBarang.data.labels = labels;
        chartJenisBarang.data.datasets[0].data = values;
        chartJenisBarang.data.datasets[0].backgroundColor = colors;
        chartJenisBarang.update();
    } else {
        chartJenisBarang = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Pendapatan', data: values, backgroundColor: colors,
                    borderColor: '#fff', borderWidth: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

function renderChartTopProduk(data) {
    const ctx = document.getElementById('chart-top-produk').getContext('2d');
    const sortedProduk = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    const labels = sortedProduk.map(item => item[0]);
    const values = sortedProduk.map(item => item[1]);
    const colors = labels.map(() => getRandomColor());

    if (chartTopProduk) {
        chartTopProduk.data.labels = labels;
        chartTopProduk.data.datasets[0].data = values;
        chartTopProduk.data.datasets[0].backgroundColor = colors;
        chartTopProduk.update();
    } else {
        chartTopProduk = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Jumlah Terjual', data: values, backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.7', '1')), borderWidth: 1
                }]
            },
            options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } }
        });
    }
}


// --- FUNGSI-FUNGSI UTAMA APLIKASI (TETAP SAMA) ---

async function loadDatabase() {
    toggleLoading(true, 'Mengunduh Data Database...');
    try {
        const urlWithCacheBuster = SCRIPT_URL + '?v=' + new Date().getTime();
        const response = await fetch(urlWithCacheBuster);
        
        if(!response.ok) throw new Error(`Koneksi Gagal: ${response.status} ${response.statusText}`);
        
        const rawText = await response.text();

        if (!rawText || rawText.trim() === "") throw new Error("Server mengembalikan respon kosong. Lakukan 'New Deployment' pada Apps Script.");

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonError) {
            if (rawText.includes("<!DOCTYPE html>")) throw new Error("Terblokir CORS. Pastikan akses Deployment adalah 'Anyone'.");
            throw new Error("Format data dari server bukan JSON. Cek Console.");
        }
        
        if (data.status === 'error') throw new Error(data.message);
        
        databaseBarang = data.barang || [];
        riwayatTransaksi = data.pesanan || [];
        
        if (databaseBarang.length === 0) showToast("Koneksi Berhasil, tapi Data Barang di Spreadsheet Kosong.", "info");
        else showToast(`Berhasil memuat ${databaseBarang.length} data barang.`);

        jenisUnik = [...new Set(databaseBarang.map(item => item.jenis).filter(Boolean))];
        updateDropdownJenis();
        updateDropdownNamaSemua();
        updateDropdownRiwayat();
        
        if(riwayatTransaksi.length > 0) tampilkanStruk(riwayatTransaksi[0]);
        
    } catch (error) {
        console.error("Load DB Error:", error);
        showToast(error.message, "error");
    } finally {
        toggleLoading(false);
    }
}

function submitBarang(e) {
    e.preventDefault();
    const jenisInput = document.getElementById('input-jenis').value.trim();
    const namaInput = document.getElementById('input-nama').value.trim();
    const hargaInput = document.getElementById('input-harga').value;
    const ukuranInput = document.getElementById('input-ukuran').value.trim();

    const existingItem = databaseBarang.find(item => 
        item.jenis.toLowerCase() === jenisInput.toLowerCase() &&
        item.nama.toLowerCase() === namaInput.toLowerCase() &&
        item.ukuran.toLowerCase() === ukuranInput.toLowerCase()
    );

    let actionType = 'addBarang';
    if (existingItem) {
        if (!confirm(`Barang sudah ada (Rp ${existingItem.harga.toLocaleString('id-ID')}).\nPerbarui harga menjadi Rp ${parseInt(hargaInput).toLocaleString('id-ID')}?`)) return; 
        actionType = 'editBarang'; 
    }

    toggleLoading(true, existingItem ? 'Memperbarui Harga...' : 'Menyimpan Barang...');
    const formData = new URLSearchParams({ action: actionType, jenis: jenisInput, nama: namaInput, harga: hargaInput, ukuran: ukuranInput });

    fetch(SCRIPT_URL, { method: 'POST', body: formData })
        .then(res => res.text())
        .then(text => {
            if (text.toLowerCase().includes("error")) throw new Error(text);
            showToast(existingItem ? "Harga berhasil diperbarui!" : "Barang berhasil ditambahkan!");
            document.getElementById('form-barang').reset();
            loadDatabase();
        })
        .catch(err => {
            showToast("Gagal menyimpan: " + err.message, "error");
            toggleLoading(false);
        });
}

function lanjutKePilihBarang() {
    const nama = document.getElementById('trans-nama-pelanggan').value.trim();
    const wa = document.getElementById('trans-no-wa').value.trim();
    if(!nama || !wa) return showToast("Nama dan No WhatsApp wajib diisi!", "error");
    document.getElementById('step-pelanggan').classList.add('hidden');
    document.getElementById('step-barang').classList.remove('hidden');
}

function kembaliKePelanggan() {
    document.getElementById('step-barang').classList.add('hidden');
    document.getElementById('step-pelanggan').classList.remove('hidden');
}

function updateDropdownJenis() {
    const select = document.getElementById('trans-jenis');
    if (select) select.innerHTML = '<option value="">-- Semua Jenis --</option>' + jenisUnik.map(j => `<option value="${j}">${j}</option>`).join('');
}

function updateDropdownNamaSemua(filterJenis = "") {
    const select = document.getElementById('trans-nama');
    if (!select) return;
    let items = filterJenis ? databaseBarang.filter(item => item.jenis === filterJenis) : databaseBarang;
    const namaUnik = [...new Set(items.map(item => item.nama).filter(Boolean))];
    select.innerHTML = '<option value="">-- Pilih Barang --</option>' + namaUnik.map(nama => `<option value="${nama}">${nama}</option>`).join('');
}

function syncNamaBerdasarkanJenis() {
    updateDropdownNamaSemua(document.getElementById('trans-jenis').value); 
    resetInputDetail(); 
}

function ubahJenisDropdown(arah) {
    const select = document.getElementById('trans-jenis');
    let index = select.selectedIndex + arah;
    if (index >= 0 && index < select.options.length) {
        select.selectedIndex = index;
        syncNamaBerdasarkanJenis(); 
    }
}

function syncJenisBerdasarkanNama() {
    const namaTerpilih = document.getElementById('trans-nama').value;
    const selectUkuran = document.getElementById('trans-ukuran');
    if (namaTerpilih) {
        const variasiBarang = databaseBarang.filter(i => i.nama === namaTerpilih);
        selectUkuran.innerHTML = variasiBarang.map(item => `<option value="${item.ukuran}">${item.ukuran}</option>`).join('');
        const selectJenis = document.getElementById('trans-jenis');
        if (variasiBarang.length > 0 && selectJenis.value !== variasiBarang[0].jenis) {
            selectJenis.value = variasiBarang[0].jenis;
        }
        syncHargaBerdasarkanUkuran();
    } else {
        resetInputDetail();
    }
}

function syncHargaBerdasarkanUkuran() {
    const namaTerpilih = document.getElementById('trans-nama').value;
    const ukuranTerpilih = document.getElementById('trans-ukuran').value;
    const item = databaseBarang.find(i => i.nama === namaTerpilih && i.ukuran === ukuranTerpilih);
    if (item) document.getElementById('trans-harga').value = item.harga.toLocaleString('id-ID');
}

function ubahJumlah(delta) {
    const input = document.getElementById('trans-jumlah');
    let val = parseInt(input.value) || 1;
    val += delta;
    if (val < 1) val = 1; 
    input.value = val;
}

function resetInputDetail() {
    document.getElementById('trans-harga').value = '';
    document.getElementById('trans-ukuran').innerHTML = '<option value="">-</option>';
    document.getElementById('trans-jumlah').value = 1;
}

function tambahkanKeKeranjang() {
    const nama = document.getElementById('trans-nama').value;
    const ukuran = document.getElementById('trans-ukuran').value;
    if(!nama) return showToast("Silakan pilih nama barang!", "error");
    const itemOriginal = databaseBarang.find(i => i.nama === nama && i.ukuran === ukuran);
    if(!itemOriginal) return showToast("Data barang tidak valid.", "error");

    const harga = parseInt(itemOriginal.harga);
    const jml = parseInt(document.getElementById('trans-jumlah').value) || 1;
    
    if(keranjang.some(k => k.nama === nama && k.ukuran === ukuran)) return showToast("Barang ini sudah ada di keranjang!", "error");

    keranjang.push({ nama, ukuran, harga, jml, subtotal: harga * jml });
    document.getElementById('trans-nama').value = '';
    resetInputDetail();
    showToast("Barang ditambahkan ke keranjang");
    renderTabelKeranjang();
}

function hapusDariKeranjang(index) {
    keranjang.splice(index, 1);
    renderTabelKeranjang();
}

function renderTabelKeranjang() {
    const tbody = document.getElementById('tabel-keranjang-body');
    if (keranjang.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-gray-400 italic">Keranjang masih kosong</td></tr>';
        document.getElementById('total-item-keranjang').innerText = '0';
        document.getElementById('total-harga-keranjang').innerText = '0';
        return;
    }

    let totalItem = 0, totalHarga = 0;
    tbody.innerHTML = keranjang.map((item, index) => {
        totalItem += item.jml;
        totalHarga += item.subtotal;
        return `
            <tr class="bg-white border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-2 font-medium text-gray-800">${item.nama}</td>
                <td class="px-4 py-2 text-center">${item.ukuran}</td>
                <td class="px-4 py-2 text-right">Rp ${item.harga.toLocaleString('id-ID')}</td>
                <td class="px-4 py-2 text-center">${item.jml}</td>
                <td class="px-4 py-2 text-right font-semibold text-blue-600">Rp ${item.subtotal.toLocaleString('id-ID')}</td>
                <td class="px-4 py-2 text-center">
                    <button onclick="hapusDariKeranjang(${index})" class="text-red-500 hover:text-red-700 p-1 rounded"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </td>
            </tr>`;
    }).join('');
    document.getElementById('total-item-keranjang').innerText = totalItem;
    document.getElementById('total-harga-keranjang').innerText = totalHarga.toLocaleString('id-ID');
}

function prosesBayar() {
    if (keranjang.length === 0) return showToast("Keranjang kosong!", "error");

    toggleLoading(true, 'Memproses Pembayaran...');
    const namaPelanggan = document.getElementById('trans-nama-pelanggan').value;
    const noWa = document.getElementById('trans-no-wa').value;
    const totalItem = keranjang.reduce((sum, item) => sum + item.jml, 0);
    const totalHarga = keranjang.reduce((sum, item) => sum + item.subtotal, 0);

    const actionType = editingTxId ? 'editTransaksi' : 'addTransaksi';
    const txId = editingTxId || ("TX_" + Date.now().toString());
    const opsiTanggal = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    
    const currentTx = {
        id: txId,
        tanggal: editingTxId && currentViewedTx ? currentViewedTx.tanggal : new Date().toLocaleDateString('id-ID', opsiTanggal), 
        nama: namaPelanggan, wa: noWa, items: [...keranjang], totalItem, totalHarga
    };

    const formData = new URLSearchParams({
        action: actionType, id: txId, nama_pelanggan: namaPelanggan, no_wa: noWa, 
        detail_pesanan: JSON.stringify(keranjang), total_item: totalItem, total_harga: totalHarga
    });

    fetch(SCRIPT_URL, { method: 'POST', body: formData })
        .then(res => res.text())
        .then(text => {
            toggleLoading(false);
            if (text.toLowerCase().includes("error")) throw new Error(text);
            
            if(editingTxId) {
                const index = riwayatTransaksi.findIndex(t => t.id === editingTxId);
                if(index > -1) riwayatTransaksi[index] = currentTx;
            } else {
                riwayatTransaksi.unshift(currentTx);
            }
            updateDropdownRiwayat();

            showToast(editingTxId ? "Pesanan Diperbarui!" : "Transaksi Disimpan!");
            tampilkanStruk(currentTx);
            switchTab('page-pesanan');
            editingTxId = null; 
        })
        .catch(err => {
            toggleLoading(false);
            showToast("Gagal menyimpan: " + err.message, "error");
        });
}

function updateDropdownRiwayat() {
    const select = document.getElementById('dropdown-riwayat');
    const areaStruk = document.getElementById('area-struk');
    
    if(riwayatTransaksi.length === 0) {
        select.innerHTML = '<option value="">-- Belum ada riwayat --</option>';
        if (areaStruk) areaStruk.classList.add('hidden'); 
        return;
    }
    
    if (areaStruk) areaStruk.classList.remove('hidden');
    select.innerHTML = riwayatTransaksi.map(tx => `<option value="${tx.id}">${tx.tanggal} - ${tx.nama}</option>`).join('');
}

function gantiRiwayat() {
    const tx = riwayatTransaksi.find(t => t.id === document.getElementById('dropdown-riwayat').value);
    if(tx) tampilkanStruk(tx);
}

function tampilkanStruk(tx) {
    currentViewedTx = tx;
    document.getElementById('struk-tanggal').innerText = tx.tanggal;
    document.getElementById('rekap-nama').innerText = tx.nama;
    document.getElementById('rekap-wa').innerText = tx.wa;
    document.getElementById('rekap-total-item').innerText = tx.totalItem;
    document.getElementById('rekap-total-harga').innerText = tx.totalHarga.toLocaleString('id-ID');

    const tbody = document.getElementById('tabel-rekap-body');
    tbody.innerHTML = tx.items.map((item, index) => `
        <tr class="border-b border-gray-100 last:border-0">
            <td class="py-2 align-top text-gray-500">${index + 1}.</td>
            <td class="py-2">
                <div class="font-semibold">${item.nama}</div>
                <div class="text-xs text-gray-500">Uk: ${item.ukuran} | @Rp ${item.harga.toLocaleString('id-ID')}</div>
            </td>
            <td class="py-2 align-top text-center font-medium">${item.jml}</td>
            <td class="py-2 align-top text-right font-semibold text-gray-800">Rp ${item.subtotal.toLocaleString('id-ID')}</td>
        </tr>
    `).join('');
    
    document.getElementById('dropdown-riwayat').value = tx.id;
}

function kirimWhatsApp() {
    if(!currentViewedTx) return showToast("Pilih data pesanan dulu!", "error");

    let { nama, wa, totalHarga, items } = currentViewedTx;
    wa = String(wa).replace(/[^0-9]/g, ''); 
    if (wa.startsWith('0')) wa = '62' + wa.substring(1);
    else if (!wa.startsWith('62')) wa = '62' + wa;

    let pesan = `Halo *${nama}*,\nBerikut rincian pesanan Anda:\n\n`;
    items.forEach((item, index) => {
        pesan += `${index+1}. ${item.nama} (Uk: ${item.ukuran})\n   ${item.jml} x Rp ${item.harga.toLocaleString('id-ID')} = Rp ${item.subtotal.toLocaleString('id-ID')}\n`;
    });
    pesan += `\n==================\n*TOTAL TAGIHAN : Rp ${totalHarga.toLocaleString('id-ID')}*\n==================\n\n`;
    pesan += `Pembayaran dapat dilakukan secara tunai atau transfer\n\n`;
    pesan += `Transfer dapat dilakukan melalui\nSeabank : 901355785479\natau\nShopee pay/gopay : 081357432595\n`;
    pesan += `Atas nama : Ummu Hayatin\n\n*Pastikan konfirmasi dengan mengirimkan bukti pembayaran.*\n\n`;
    pesan += `Terima kasih banyak, Semoga berkah! 🙏😊`;

    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(pesan)}`, '_blank');
}

function cetakStruk() {
    window.print();
}

function editPesanan() {
    if(!currentViewedTx) return showToast("Pilih data pesanan dulu!", "error");
    editingTxId = currentViewedTx.id;
    document.getElementById('trans-nama-pelanggan').value = currentViewedTx.nama;
    document.getElementById('trans-no-wa').value = currentViewedTx.wa;
    keranjang = JSON.parse(JSON.stringify(currentViewedTx.items));
    renderTabelKeranjang();
    lanjutKePilihBarang(); 
    switchTab('page-transaksi');
    showToast("Mode Edit: Silakan perbarui pesanan", "info");
}

function hapusPesanan() {
    if(!currentViewedTx) return showToast("Pilih data pesanan dulu!", "error");
    if(!confirm(`Yakin ingin MENGHAPUS pesanan atas nama ${currentViewedTx.nama}?`)) return;

    toggleLoading(true, 'Menghapus Pesanan...');
    const formData = new URLSearchParams({ action: 'deleteTransaksi', id: currentViewedTx.id });

    fetch(SCRIPT_URL, { method: 'POST', body: formData })
        .then(res => res.text())
        .then(text => {
            toggleLoading(false);
            showToast("Pesanan berhasil dihapus!");
            
            riwayatTransaksi = riwayatTransaksi.filter(t => t.id !== currentViewedTx.id);
            updateDropdownRiwayat();
            
            if(riwayatTransaksi.length > 0) {
                tampilkanStruk(riwayatTransaksi[0]);
            } else {
                currentViewedTx = null;
                document.getElementById('area-struk').classList.add('hidden');
            }
        })
        .catch(err => {
            toggleLoading(false);
            showToast("Gagal menghapus pesanan: " + err.message, "error");
        });
}

function resetSemua() {
    keranjang = [];
    editingTxId = null;
    document.getElementById('trans-nama-pelanggan').value = '';
    document.getElementById('trans-no-wa').value = '';
    renderTabelKeranjang();
    kembaliKePelanggan();
    switchTab('page-transaksi');
}
