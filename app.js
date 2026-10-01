const firebaseConfig = {
  apiKey: "AIzaSyB0uIxdiHbKPQ_msqIPWDEyyq0KHhUPJVA",
  authDomain: "baraban-15164.firebaseapp.com",
  databaseURL: "https://baraban-15164-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "baraban-15164",
  storageBucket: "baraban-15164.firebasestorage.app",
  messagingSenderId: "836479526930",
  appId: "1:836479526930:web:9312fa9f8e3b5c0d80d0cb",
  measurementId: "G-K615WMWKV8"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const auth = firebase.auth();

const { createApp, ref, computed, watch, onMounted } = Vue;

// Liga nizomi: 10 jamoa, har birida 8 o'yinchi (5 asosiy + 3 zaxira),
// har tur shanba (3 o'yin) va yakshanbaga (2 o'yin) bo'linadi, o'yin 2 x 25 daqiqa + 10 daqiqa tanaffus.
const LEAGUE = {
    teams: 10,
    squad: 8,
    slots: [
        { day: 0, time: '17:00' }, { day: 0, time: '18:00' }, { day: 0, time: '19:00' },
        { day: 1, time: '18:00' }, { day: 1, time: '19:00' }
    ]
};

// 'YYYY-MM-DD' sanaga kun qo'shish (vaqt mintaqasidan qat'i nazar to'g'ri ishlaydi)
const addDays = (iso, days) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const weekday = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 6 = shanba
};

const app = createApp({
    setup() {
        const currentTab = ref('teams');
        const tabs = [
            { id: 'teams', label: 'Jamoalar' },
            { id: 'players', label: "O'yinchilar" },
            { id: 'schedule', label: 'Kalendar' },
            { id: 'matches', label: 'Natijalar' }
        ];
        const tabIndex = computed(() => tabs.findIndex(t => t.id === currentTab.value));
        const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
        const roundDates = (round) => {
            const ds = [...new Set(round.matches.map(m => m.date))].sort();
            if (!ds.length) return '';
            const a = ds[0], b = ds[ds.length - 1];
            if (a === b) return formatDate(a);
            return a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8))}–${formatDate(b)}` : `${formatDate(a)} – ${formatDate(b)}`;
        };
        const DAYS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Sha'];
        const dayShort = (d) => d ? DAYS[weekday(d)] : '';
        const formatDate = (d) => {
            if (!d) return '';
            const [y, m, day] = d.split('-').map(Number);
            return `${day}-${MONTHS[m - 1]}`;
        };
        const startDate = ref('');
        const generated = ref(false);

        // Data Storage
        const teams = ref([]);
        const players = ref([]);
        const schedule = ref([]); // { round, matches: [] }

        // Form states
        const newTeam = ref({ name: '', shortName: '', faculty: '', color: '#008000' });
        const newPlayer = ref({ firstName: '', lastName: '', number: '', position: 'FW', faculty: '', course: '1', teamId: '' });
        const activeMatchDetails = ref(null);
        const newEvent = ref({ type: 'goal', playerId: '', minute: '', assistPlayerId: '' });

        // Kirish (faqat admin yoza oladi — tekshiruv Firebase qoidalarida)
        const user = ref(null);
        const authReady = ref(false);
        const loginForm = ref({ email: '', password: '' });
        const loginError = ref('');
        const loggingIn = ref(false);
        const saveState = ref('saved'); // saved | saving | error

        auth.onAuthStateChanged(u => {
            user.value = u ? { email: u.email } : null;
            authReady.value = true;
        });

        const login = async () => {
            loginError.value = '';
            if (!loginForm.value.email || !loginForm.value.password) {
                loginError.value = 'Email va parolni kiriting';
                return;
            }
            loggingIn.value = true;
            try {
                await auth.signInWithEmailAndPassword(loginForm.value.email.trim(), loginForm.value.password);
                loginForm.value.password = '';
            } catch (e) {
                const codes = {
                    'auth/invalid-credential': "Email yoki parol noto'g'ri",
                    'auth/wrong-password': "Email yoki parol noto'g'ri",
                    'auth/user-not-found': "Email yoki parol noto'g'ri",
                    'auth/invalid-email': "Email noto'g'ri yozilgan",
                    'auth/too-many-requests': "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring",
                    'auth/operation-not-allowed': "Firebase'da Email/Parol orqali kirish yoqilmagan",
                    'auth/network-request-failed': "Internet aloqasi yo'q"
                };
                loginError.value = codes[e.code] || e.message;
            } finally {
                loggingIn.value = false;
            }
        };

        const logout = () => auth.signOut();

        // Load Data
        // Firebase bo'sh massivlarni va null qiymatlarni saqlamaydi — shu sababli qayta tiklaymiz
        const normalizeSchedule = (sched) => (sched || []).map(r => ({
            ...r,
            matches: (r.matches || []).map(m => ({
                ...m,
                score1: m.score1 ?? null,
                score2: m.score2 ?? null,
                events: m.events || []
            }))
        }));

        let lastSaved = null;
        const snapshotJSON = () => JSON.stringify({
            teams: teams.value, players: players.value,
            schedule: schedule.value, generated: generated.value
        });

        const loadData = () => {
            db.ref('uniliga').on('value', snap => {
                const data = snap.val() || {};
                const activeId = activeMatchDetails.value ? activeMatchDetails.value.id : null;
                teams.value = data.teams || [];
                players.value = data.players || [];
                schedule.value = normalizeSchedule(data.schedule);
                generated.value = data.generated || false;
                lastSaved = snapshotJSON();
                // Ochiq turgan o'yinni yangi obyektga qayta bog'laymiz, aks holda o'zgarishlar saqlanmaydi
                if (activeId) {
                    let found = null;
                    schedule.value.forEach(r => r.matches.forEach(m => { if (m.id === activeId) found = m; }));
                    activeMatchDetails.value = found;
                }
            });
        };

        // Save Data
        const saveData = () => {
            if (!user.value) return;
            const json = snapshotJSON();
            if (json === lastSaved) return; // bazadan kelgan ma'lumotni qayta yozmaymiz
            lastSaved = json;
            saveState.value = 'saving';
            db.ref('uniliga').set(JSON.parse(json))
                .then(() => { saveState.value = 'saved'; })
                .catch(err => {
                    saveState.value = 'error';
                    const denied = String(err.code || err.message).toLowerCase().includes('permission');
                    alert(denied ? "Bu akkauntga natijalarni o'zgartirishga ruxsat berilmagan." : "Saqlashda xato: " + err.message);
                    // Rad etilgan yozuvni Firebase o'zi bekor qiladi va eski holatni qaytaradi
                });
        };

        // Watchers
        watch([teams, players, schedule, generated], saveData, { deep: true });

        // Team Logic
        const addTeam = () => {
            if (!newTeam.value.name || !newTeam.value.shortName) return alert('Nom kiritish majburiy');
            if (!newTeam.value.faculty.trim()) return alert("Fakultetni kiriting: har bir jamoa bitta fakultet talabalaridan tuziladi");
            if (teams.value.length >= LEAGUE.teams) return alert(`Ligada ko'pi bilan ${LEAGUE.teams} ta jamoa bo'ladi`);
            
            teams.value.push({
                id: Date.now().toString(),
                name: newTeam.value.name,
                shortName: newTeam.value.shortName,
                faculty: newTeam.value.faculty,
                color: newTeam.value.color
            });
            newTeam.value = { name: '', shortName: '', faculty: '', color: '#008000' };
        };

        const deleteTeam = (id) => {
            if (generated.value) return alert("Jadval yaratilgan. Jamoani o'chirish uchun avval jadvalni o'chiring.");
            if (!confirm("Jamoa va uning barcha o'yinchilari o'chiriladi. Davom etasizmi?")) return;
            teams.value = teams.value.filter(t => t.id !== id);
            players.value = players.value.filter(p => p.teamId !== id);
        };

        // Player Logic
        const addPlayer = () => {
            if (!newPlayer.value.firstName || !newPlayer.value.teamId) return alert('Ism va Jamoa majburiy');
            const teamPlayersCount = players.value.filter(p => p.teamId === newPlayer.value.teamId).length;
            if (teamPlayersCount >= LEAGUE.squad) return alert(`Jamoada ${LEAGUE.squad} ta o'yinchi bo'ladi (5 asosiy + 3 zaxira). Bu jamoa to'liq.`);
            if (newPlayer.value.number && players.value.some(p => p.teamId === newPlayer.value.teamId && String(p.number) === String(newPlayer.value.number))) {
                return alert(`${newPlayer.value.number}-raqam bu jamoada band`);
            }

            players.value.push({
                id: Date.now().toString(),
                firstName: newPlayer.value.firstName,
                lastName: newPlayer.value.lastName,
                number: newPlayer.value.number,
                position: newPlayer.value.position,
                faculty: newPlayer.value.faculty,
                course: newPlayer.value.course,
                teamId: newPlayer.value.teamId
            });
            // Reset but keep team
            newPlayer.value.firstName = '';
            newPlayer.value.lastName = '';
            newPlayer.value.number = '';
        };

        const deletePlayer = (id) => {
            players.value = players.value.filter(p => p.id !== id);
        };
        
        const getPlayerName = (id) => {
            const p = players.value.find(p => p.id === id);
            return p ? `${p.firstName} ${p.lastName}` : 'Noma\'lum';
        };

        const getTeamName = (id) => {
            const t = teams.value.find(t => t.id === id);
            return t ? t.name : 'Noma\'lum';
        };
        
        const getTeamPlayers = (teamId) => {
            return players.value.filter(p => p.teamId === teamId);
        };

        // Avtomatik jadval (aylana usuli): 9 tur, har turda 5 o'yin
        const generateSchedule = () => {
            if (teams.value.length !== LEAGUE.teams) return alert(`Iltimos, avval ${LEAGUE.teams} ta jamoani to'liq ro'yxatdan o'tkazing!`);
            if (!startDate.value) return alert("Iltimos, 1-tur boshlanadigan shanba sanasini tanlang!");
            if (weekday(startDate.value) !== 6) return alert("Boshlanish sanasi shanba bo'lishi kerak: har tur shanba va yakshanba kunlari o'tadi.");

            for (const t of teams.value) {
                const n = getTeamPlayers(t.id).length;
                if (n !== LEAGUE.squad) {
                    return alert(`"${t.name}" jamoasida ${n} ta o'yinchi bor. Har bir jamoada aniq ${LEAGUE.squad} ta o'yinchi (5 asosiy + 3 zaxira) bo'lishi shart.`);
                }
            }

            const t = [...teams.value];
            const numTeams = t.length;
            const rounds = numTeams - 1;
            const matchesPerRound = numTeams / 2;
            const stamp = Date.now();
            const sched = [];

            for (let round = 0; round < rounds; round++) {
                const saturday = addDays(startDate.value, round * 7);
                const roundMatches = [];

                for (let match = 0; match < matchesPerRound; match++) {
                    const home = (round + match) % (numTeams - 1);
                    const away = match === 0 ? numTeams - 1 : (numTeams - 1 - match + round) % (numTeams - 1);
                    const slot = LEAGUE.slots[match];

                    roundMatches.push({
                        id: `m_${round}_${match}_${stamp}`,
                        team1: t[home].id,
                        team2: t[away].id,
                        score1: null,
                        score2: null,
                        status: 'pending', // pending, finished, technical
                        date: addDays(saturday, slot.day),
                        time: slot.time,
                        events: []
                    });
                }
                sched.push({ round: round + 1, matches: roundMatches });
            }

            schedule.value = sched;
            generated.value = true;
            alert('Jadval muvaffaqiyatli yaratildi!');
        };

        const resetSchedule = () => {
            if(confirm("Barcha jadval va kiritilgan natijalar o'chib ketadi. Ishonchingiz komilmi?")) {
                schedule.value = [];
                generated.value = false;
            }
        };

        // Match Management
        const finishMatch = (match) => {
            const s1 = parseInt(match.score1), s2 = parseInt(match.score2);
            if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
                return alert("Hisobni kiriting!");
            }
            match.score1 = s1;
            match.score2 = s2;
            match.status = 'finished';
        };
        
        const setTechnical = (match, winnerTeamIndex) => {
            if(winnerTeamIndex === 1) {
                match.score1 = 3; match.score2 = 0;
            } else {
                match.score1 = 0; match.score2 = 3;
            }
            match.status = 'technical';
        };
        
        const resetMatch = (match) => {
            match.score1 = null;
            match.score2 = null;
            match.status = 'pending';
        };

        const openMatchDetails = (match) => {
            activeMatchDetails.value = match;
            newEvent.value = { type: 'goal', playerId: '', minute: '', assistPlayerId: '' };
        };
        
        const addEvent = () => {
            if(!newEvent.value.playerId || !newEvent.value.minute) return alert("O'yinchi va daqiqa majburiy");
            
            activeMatchDetails.value.events.push({
                id: Date.now().toString(),
                ...newEvent.value
            });
            
            // Sort events by minute
            activeMatchDetails.value.events.sort((a,b) => parseInt(a.minute) - parseInt(b.minute));
            
            newEvent.value.minute = '';
            newEvent.value.playerId = '';
            newEvent.value.assistPlayerId = '';
        };
        
        const removeEvent = (eventId) => {
            activeMatchDetails.value.events = activeMatchDetails.value.events.filter(e => e.id !== eventId);
        };
        
        const getMatchPlayers = (match) => {
            return [
                ...getTeamPlayers(match.team1).map(p => ({...p, teamType: 'home'})),
                ...getTeamPlayers(match.team2).map(p => ({...p, teamType: 'away'}))
            ];
        };

        onMounted(() => {
            loadData();
        });

                const positionOptions = [
            {value: 'GK', label: 'Darvozabon (GK)'},
            {value: 'DF', label: 'Himoyachi (DF)'},
            {value: 'MF', label: 'Yarim himoyachi (MF)'},
            {value: 'FW', label: 'Hujumchi (FW)'}
        ];
        const eventTypeOptions = [
            {value: 'goal', label: '⚽ Gol'},
            {value: 'yellowCard', label: '🟨 Sariq'},
            {value: 'redCard', label: '🟥 Qizil'}
        ];
        const teamOptions = computed(() => teams.value.map(t => ({ value: t.id, label: t.name + ' (' + getTeamPlayers(t.id).length + '/' + LEAGUE.squad + ')' })));
        const eventPlayerOptions = computed(() => {
            if(!activeMatchDetails.value) return [];
            return getMatchPlayers(activeMatchDetails.value).map(p => ({ value: p.id, label: '(' + (p.teamType==='home'?'Uy':'Mehmon') + ') ' + p.firstName + ' ' + p.lastName }));
        });
        const eventAssistOptions = computed(() => {
            if(!activeMatchDetails.value) return [];
            return getMatchPlayers(activeMatchDetails.value).map(p => ({ value: p.id, label: p.firstName + ' ' + p.lastName }));
        });
                const getTeamLogo = (color, shortName) => {
            const text = shortName ? shortName.substring(0,3).toUpperCase() : 'FC';
            const c = color || '#008000';
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:${c};stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#000000;stop-opacity:0.7" />
                    </linearGradient>
                </defs>
                <path d="M10 20 L50 5 L90 20 L85 65 C80 85 50 95 50 95 C50 95 20 85 15 65 Z" fill="url(#grad1)" stroke="rgba(255,255,255,0.8)" stroke-width="3"/>
                <path d="M50 5 L90 20 L85 65 C80 85 50 95 50 95 Z" fill="rgba(255,255,255,0.1)"/>
                <text x="50" y="60" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">${text}</text>
            </svg>`;
            return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        };

        const currentRound = computed(() => {
            if(!schedule.value || schedule.value.length === 0) return null;
            const round = schedule.value.find(r => r.matches.some(m => m.status === 'pending'));
            return round || schedule.value[schedule.value.length - 1];
        });
        return {
            currentTab, teamOptions, positionOptions, eventTypeOptions, eventPlayerOptions, eventAssistOptions,
            teams, players, schedule, startDate, generated,
            newTeam, newPlayer,
            addTeam, deleteTeam,
            addPlayer, deletePlayer, getPlayerName, getTeamName, getTeamLogo, getTeamPlayers,
            generateSchedule, resetSchedule,
            finishMatch, setTechnical, resetMatch,
            activeMatchDetails, openMatchDetails, newEvent, addEvent, removeEvent, getMatchPlayers,
            user, authReady, loginForm, loginError, loggingIn, login, logout, saveState,
            tabs, tabIndex, formatDate, LEAGUE, roundDates, dayShort
        };
    }
});

app.directive('click-outside', {
  beforeMount(el, binding) {
    el.clickOutsideEvent = function(event) {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value(event);
      }
    };
    document.body.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el) {
    document.body.removeEventListener('click', el.clickOutsideEvent);
  }
});

app.component('custom-select', {
    props: ['modelValue', 'options', 'placeholder'],
    template: `
        <div class="relative w-full text-sm" v-click-outside="() => isOpen = false">
            <div @click="isOpen = !isOpen" class="input-3d cursor-pointer flex justify-between items-center" :class="{ active: isOpen }">
                <span class="truncate" :style="{ color: modelValue ? '#fff' : '#64748b' }">{{ selectedLabel || placeholder }}</span>
                <i class="fas fa-chevron-down text-green-400 transition-transform duration-300 ml-2" :class="{'rotate-180': isOpen}"></i>
            </div>
            <transition name="fade">
                <div v-if="isOpen" class="dropdown">
                    <div v-if="!options.length" style="color:#64748b">Ro'yxat bo'sh</div>
                    <div v-for="opt in options" :key="opt.value" @click="selectOption(opt)" :class="{ sel: modelValue === opt.value }">
                        {{ opt.label }}
                    </div>
                </div>
            </transition>
        </div>
    `,
    data() {
        return { isOpen: false }
    },
    computed: {
        selectedLabel() {
            const opt = this.options.find(o => o.value == this.modelValue);
            return opt ? opt.label : '';
        }
    },
    methods: {
        selectOption(opt) {
            this.$emit('update:modelValue', opt.value);
            this.isOpen = false;
        }
    }
});

app.mount('#app');
