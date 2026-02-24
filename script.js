// --- KONFIGURASI URL APPS SCRIPT ---
// URL ini sudah diisi sesuai permintaan Anda.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzX_vVW7xQFa1PkDqSPl9UFgUEZMMiisd12q8NNVDSEhdeXBN90y9vkDb0D49jwuhsxyQ/exec';

// --- STATE APLIKASI ---
let databaseBarang = [];
let keranjang = [];
let jenisUnik = [];
let riwayatTransaksi = []; 
let currentViewedTx = null;
let editingTxId = null;

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
}

// --- KOMUNIKASI DATABASE (DENGAN MODE DEBUGGING) ---
async function loadDatabase() {
    toggleLoading(true, 'Mengunduh Data Database...');
    try {
        const urlWithCacheBuster = SCRIPT_URL + '?v=' + new Date().getTime();
        
        const response = await fetch(urlWithCacheBuster);
        
        if(!response.ok) {
            throw new Error(`Koneksi Gagal: ${response.status} ${response.statusText}`);
        }
        
        const rawText = await response.text();

        if (!rawText || rawText.trim() === "") {
            throw new Error("Server mengembalikan respon kosong. Pastikan Anda melakukan 'New Deployment' dan tidak ada error di script.");
        }

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonError) {
            if (rawText.includes("<!DOCTYPE html>")) {
                throw new Error("Terblokir CORS/Otentikasi. Pastikan akses Deployment adalah 'Anyone'.");
            }
            throw new Error("Format data dari server bukan JSON yang valid. Cek Console untuk detail.");
        }
        
        if (data.status === 'error') {
            throw new Error(data.message || "Terjadi kesalahan pada Server Apps Script.");
        }
        
        if (Array.isArray(data)) {
            databaseBarang = data;
        } else {
            databaseBarang = data.barang || [];
            riwayatTransaksi = data.pesanan || [];
        }
        
        if (databaseBarang.length === 0) {
            showToast("Koneksi Berhasil, tapi Data Barang di Spreadsheet Kosong.", "info");
        } else {
            showToast(`Berhasil memuat ${databaseBarang.length} data barang.`);
        }

        jenisUnik = [...new Set(databaseBarang.map(item => item.jenis).filter(Boolean))];
        updateDropdownJenis();
        updateDropdownNamaSemua();
        updateDropdownRiwayat();
        
        if(riwayatTransaksi.length > 0) {
            tampilkanStruk(riwayatTransaksi[0]);
        }
        
    } catch (error) {
        console.error("Load DB Error:", error);
        showToast(error.message, "error");
    } finally {
        toggleLoading(false);
    }
}


// --- HALAMAN 1: INPUT BARANG ---
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
        const isConfirmed = confirm(`Data barang sudah tersedia (Harga saat ini: Rp ${existingItem.harga.toLocaleString('id-ID')}).\nApakah Anda ingin memperbarui harga barang menjadi Rp ${parseInt(hargaInput).toLocaleString('id-ID')}?`);
        if (!isConfirmed) return; 
        actionType = 'editBarang'; 
    }

    toggleLoading(true, existingItem ? 'Memperbarui Harga Barang...' : 'Menyimpan Barang...');

    const formData = new URLSearchParams();
    formData.append('action', actionType);
    formData.append('jenis', jenisInput);
    formData.append('nama', namaInput);
    formData.append('harga', hargaInput);
    formData.append('ukuran', ukuranInput);

    fetch(SCRIPT_URL, { method: 'POST', body: formData })
        .then(res => res.text())
        .then(text => {
            if (text.toLowerCase().includes("error")) throw new Error(text);
            
            showToast(existingItem ? "Harga barang berhasil diperbarui!" : "Barang berhasil ditambahkan!");
            document.getElementById('form-barang').reset();
            loadDatabase();
        })
        .catch(err => {
            showToast("Gagal menyimpan: " + err.message, "error");
            toggleLoading(false);
        });
}

// --- HALAMAN 2: TRANSAKSI (LOGIKA DROPDOWN & KERANJANG) ---
function lanjutKePilihBarang() {
    const nama = document.getElementById('trans-nama-pelanggan').value.trim();
    const wa = document.getElementById('trans-no-wa').value.trim();
    
    if(!nama || !wa) {
        showToast("Nama dan No WhatsApp wajib diisi!", "error");
        return;
    }

    document.getElementById('step-pelanggan').classList.add('hidden');
    document.getElementById('step-barang').classList.remove('hidden');
}

function kembaliKePelanggan() {
    document.getElementById('step-barang').classList.add('hidden');
    document.getElementById('step-pelanggan').classList.remove('hidden');
}

function updateDropdownJenis() {
    const select = document.getElementById('trans-jenis');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Semua Jenis --</option>' + 
        jenisUnik.map(j => `<option value="${j}">${j}</option>`).join('');
}

function updateDropdownNamaSemua(filterJenis = "") {
    const select = document.getElementById('trans-nama');
    if (!select) return;

    let items = databaseBarang;
    if (filterJenis) {
        items = databaseBarang.filter(item => item.jenis === filterJenis);
    }
    
    const namaUnik = [...new Set(items.map(item => item.nama).filter(Boolean))];
    
    select.innerHTML = '<option value="">-- Pilih Barang --</option>' + 
        namaUnik.map(nama => `<option value="${nama}">${nama}</option>`).join('');
}

function syncNamaBerdasarkanJenis() {
    const jenisTerpilih = document.getElementById('trans-jenis').value;
    updateDropdownNamaSemua(jenisTerpilih); 
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
    
    if (item) {
        document.getElementById('trans-harga').value = item.harga.toLocaleString('id-ID');
    }
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
    const namaSelect = document.getElementById('trans-nama');
    const nama = namaSelect.value;
    const ukuran = document.getElementById('trans-ukuran').value;
    
    if(!nama) return showToast("Silakan pilih nama barang terlebih dahulu!", "error");

    const itemOriginal = databaseBarang.find(i => i.nama === nama && i.ukuran === ukuran);
    if(!itemOriginal) return showToast("Data barang tidak valid.", "error");

    const harga = parseInt(itemOriginal.harga);
    const jml = parseInt(document.getElementById('trans-jumlah').value) || 1;
    
    const indexAda = keranjang.findIndex(k => k.nama === nama && k.ukuran === ukuran);
    if(indexAda > -1) {
        return showToast("Barang dengan ukuran tersebut sudah ada di keranjang!", "error");
    } else {
        keranjang.push({ 
            nama: nama, 
            ukuran: ukuran, 
            harga: harga, 
            jml: jml, 
            subtotal: harga * jml 
        });
    }

    document.getElementById('trans-nama').value = '';
    document.getElementById('trans-jumlah').value = 1;
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

    let html = '';
    let totalItem = 0;
    let totalHarga = 0;

    keranjang.forEach((item, index) => {
        totalItem += item.jml;
        totalHarga += item.subtotal;
        html += `
            <tr class="bg-white border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-2 font-medium text-gray-800">${item.nama}</td>
                <td class="px-4 py-2 text-center">${item.ukuran}</td>
                <td class="px-4 py-2 text-right">Rp ${item.harga.toLocaleString('id-ID')}</td>
                <td class="px-4 py-2 text-center">${item.jml}</td>
                <td class="px-4 py-2 text-right font-semibold text-blue-600">Rp ${item.subtotal.toLocaleString('id-ID')}</td>
                <td class="px-4 py-2 text-center">
                    <button onclick="hapusDariKeranjang(${index})" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1 rounded">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    document.getElementById('total-item-keranjang').innerText = totalItem;
    document.getElementById('total-harga-keranjang').innerText = totalHarga.toLocaleString('id-ID');
}

function prosesBayar() {
    if (keranjang.length === 0) return showToast("Keranjang kosong! Tambahkan barang dulu.", "error");

    const namaPelanggan = document.getElementById('trans-nama-pelanggan').value;
    const noWa = document.getElementById('trans-no-wa').value;
    const totalItem = keranjang.reduce((sum, item) => sum + item.jml, 0);
    const totalHarga = keranjang.reduce((sum, item) => sum + item.subtotal, 0);

    toggleLoading(true, 'Memproses Pembayaran...');

    const actionType = editingTxId ? 'editTransaksi' : 'addTransaksi';
    const txId = editingTxId || ("TX_" + Date.now().toString());
    const opsiTanggal = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    
    const currentTx = {
        id: txId,
        tanggal: editingTxId && currentViewedTx ? currentViewedTx.tanggal : new Date().toLocaleDateString('id-ID', opsiTanggal), 
        nama: namaPelanggan,
        wa: noWa,
        items: [...keranjang],
        totalItem: totalItem,
        totalHarga: totalHarga
    };

    const formData = new URLSearchParams();
    formData.append('action', actionType);
    formData.append('id', txId);
    formData.append('nama_pelanggan', namaPelanggan);
    formData.append('no_wa', noWa);
    formData.append('detail_pesanan', JSON.stringify(keranjang));
    formData.append('total_item', totalItem);
    formData.append('total_harga', totalHarga);

    fetch(SCRIPT_URL, { method: 'POST', body: formData })
        .then(res => res.text())
        .then(text => {
            toggleLoading(false);
            
            if (text.includes("ID tidak ditemukan") || (actionType === 'editTransaksi' && !text.includes("diperbarui"))) {
                let errorMsg = text.includes("ID tidak ditemukan") 
                    ? "Gagal: Pesanan lama ini belum memiliki ID di Spreadsheet." 
                    : "Gagal: Respon server tidak valid.";
                showToast(errorMsg, "error");
                loadDatabase(); 
                return;
            }

            if(editingTxId) {
                const index = riwayatTransaksi.findIndex(t => t.id === editingTxId);
                if(index > -1) riwayatTransaksi[index] = currentTx;
            } else {
                riwayatTransaksi.unshift(currentTx);
            }
            updateDropdownRiwayat();

            showToast(editingTxId ? "Pesanan Berhasil Diperbarui!" : "Transaksi Berhasil Disimpan!");
            tampilkanStruk(currentTx);
            switchTab('page-pesanan');
            editingTxId = null; 
        })
        .catch(err => {
            toggleLoading(false);
            showToast("Gagal menyimpan transaksi: " + err.message, "error");
        });
}

// --- HALAMAN 3: STRUK & REKAP ---
function updateDropdownRiwayat() {
    const select = document.getElementById('dropdown-riwayat');
    const areaStruk = document.getElementById('area-struk');
    
    if(riwayatTransaksi.length === 0) {
        select.innerHTML = '<option value="">-- Belum ada riwayat --</option>';
        areaStruk.classList.add('hidden'); 
        return;
    }
    
    areaStruk.classList.remove('hidden');
    select.innerHTML = riwayatTransaksi.map(tx => 
        `<option value="${tx.id}">${tx.tanggal} - ${tx.nama}</option>`
    ).join('');
}

function gantiRiwayat() {
    const id = document.getElementById('dropdown-riwayat').value;
    const tx = riwayatTransaksi.find(t => t.id === id);
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
    let html = '';
    tx.items.forEach((item, index) => {
        html += `
            <tr class="border-b border-gray-100 last:border-0">
                <td class="py-2 align-top text-gray-500">${index + 1}.</td>
                <td class="py-2">
                    <div class="font-semibold">${item.nama}</div>
                    <div class="text-xs text-gray-500">Uk: ${item.ukuran} | @Rp ${item.harga.toLocaleString('id-ID')}</div>
                </td>
                <td class="py-2 align-top text-center font-medium">${item.jml}</td>
                <td class="py-2 align-top text-right font-semibold text-gray-800">Rp ${item.subtotal.toLocaleString('id-ID')}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    
    document.getElementById('dropdown-riwayat').value = tx.id;
}

function kirimWhatsApp() {
    if(!currentViewedTx) return showToast("Tidak ada data pesanan yang dipilih!", "error");

    let nama = currentViewedTx.nama;
    let wa = String(currentViewedTx.wa); 
    let totalHarga = currentViewedTx.totalHarga.toLocaleString('id-ID');
    
    wa = wa.replace(/[^0-9]/g, ''); 
    
    if (wa.startsWith('0')) {
        wa = '62' + wa.substring(1);
    } else if (!wa.startsWith('62')) {
        wa = '62' + wa;
    }

    let pesan = `Halo *${nama}*,\nBerikut adalah rincian pesanan Anda dari toko kami:\n\n`;
    currentViewedTx.items.forEach((item, index) => {
        pesan += `${index+1}. ${item.nama} (Uk: ${item.ukuran})\n   ${item.jml} x Rp ${item.harga.toLocaleString('id-ID')} = Rp ${item.subtotal.toLocaleString('id-ID')}\n`;
    });
    pesan += `\n==================\n`;
    pesan += `*TOTAL TAGIHAN : Rp ${totalHarga}*\n`;
    pesan += `==================\n\n`;
    pesan += `Pembayaran dapat dilakukan secara tunai atau transfer\n\n`;
    pesan += `Transfer dapat dilakukan melalui\n`;
    pesan += `Seabank : 901355785479\n`;
    pesan += `atau\n`;
    pesan += `Shoppe pay/gopay : 081357432595`;
    pesan += `Atas nama : Ummu Hayatin\n\n`;
    pesan += `*Pastikan konfirmasi dengan mengirimkan bukti pembayaran.*\n\n`;
    pesan += `Terima kasih banyak telah berbelanja, Semoga berkah! 🙏😊`;

    const url = `https://wa.me/${wa}?text=${encodeURIComponent(pesan)}`;
    window.open(url, '_blank');
}

function cetakStruk() {
    window.print();
}

function editPesanan() {
    if(!currentViewedTx) return showToast("Tidak ada data pesanan yang dipilih!", "error");
    
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
    if(!currentViewedTx) return showToast("Tidak ada data pesanan yang dipilih!", "error");
    
    if(!confirm(`Apakah Anda yakin ingin MEMBATALKAN dan MENGHAPUS pesanan atas nama ${currentViewedTx.nama}?`)) {
        return;
    }

    const txId = currentViewedTx.id;
    toggleLoading(true, 'Menghapus Pesanan...');

    const formData = new URLSearchParams();
    formData.append('action', 'deleteTransaksi');
    formData.append('id', txId);

    fetch(SCRIPT_URL, { method: 'POST', body: formData })
        .then(res => res.text())
        .then(text => {
            toggleLoading(false);
            showToast("Pesanan berhasil dihapus!");
            
            riwayatTransaksi = riwayatTransaksi.filter(t => t.id !== txId);
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
