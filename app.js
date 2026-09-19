const { createApp, ref, computed, watch, onMounted } = Vue;

const app = createApp({
    setup() {
        const currentTab = ref('teams');
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

        // Load Data
        const loadData = () => {
            const t = localStorage.getItem('uniliga_teams');
            const p = localStorage.getItem('uniliga_players');
            const s = localStorage.getItem('uniliga_schedule');
            
            if (t) teams.value = JSON.parse(t);
            if (p) players.value = JSON.parse(p);
            if (s) {
                schedule.value = JSON.parse(s);
                generated.value = schedule.value.length > 0;
            }
        };

        // Save Data
        const saveData = () => {
            localStorage.setItem('uniliga_teams', JSON.stringify(teams.value));
            localStorage.setItem('uniliga_players', JSON.stringify(players.value));
            localStorage.setItem('uniliga_schedule', JSON.stringify(schedule.value));
        };

        // Watchers
        watch([teams, players, schedule], saveData, { deep: true });

        // Team Logic
        const addTeam = () => {
            if (!newTeam.value.name || !newTeam.value.shortName) return alert('Nom kiritish majburiy');
            if (teams.value.length >= 10) return alert('Maksimal 10 ta jamoa');
            
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
            teams.value = teams.value.filter(t => t.id !== id);
            players.value = players.value.filter(p => p.teamId !== id);
        };

        // Player Logic
        const addPlayer = () => {
            if (!newPlayer.value.firstName || !newPlayer.value.teamId) return alert('Ism va Jamoa majburiy');
            const teamPlayersCount = players.value.filter(p => p.teamId === newPlayer.value.teamId).length;
            if (teamPlayersCount >= 10) return alert('Bir jamoada ko\'pi bilan 10 o\'yinchi bo\'lishi mumkin'); // 5+5 or similar

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

        // Auto Scheduling (Circle Method)
        const generateSchedule = () => {
            if (teams.value.length < 10) return alert("Iltimos, avval 10 ta jamoani to'liq ro'yxatdan o'tkazing!");
            if (!startDate.value) return alert("Bo'sh maydon: Iltimos, 1-tur boshlanish sanasini tanlang!");
            
            // Check if every team has at least 5 players
            for (let t of teams.value) {
                if (getTeamPlayers(t.id).length < 5) {
                    return alert(`"${t.name}" jamoasida o'yinchilar kam! Kamida 5 ta o'yinchi kiritishingiz shart. Iltimos, barcha ma'lumotlarni to'liq qiling.`);
                }
            }

            let start = new Date(startDate.value);
            
            const t = [...teams.value];
            const numTeams = t.length;
            const rounds = numTeams - 1;
            const matchesPerRound = numTeams / 2;
            
            let sched = [];
            
            for (let round = 0; round < rounds; round++) {
                let roundMatches = [];
                let matchDate = new Date(start);
                // Har bir tur bitta dam olish kuniga to'g'ri keladi (Shanba). 
                // Biz hozircha har bir turni haftasiga qilib belgilaymiz.
                matchDate.setDate(start.getDate() + (round * 7));
                
                let times = ["10:00", "11:30", "13:00", "14:30", "16:00"];

                for (let match = 0; match < matchesPerRound; match++) {
                    const home = (round + match) % (numTeams - 1);
                    let away = (numTeams - 1 - match + round) % (numTeams - 1);
                    
                    if (match === 0) {
                        away = numTeams - 1;
                    }
                    
                    // Vaqt tanlash
                    let time = times[match] || "17:00";

                    roundMatches.push({
                        id: `m_${round}_${match}_${Date.now()}`,
                        team1: t[home].id,
                        team2: t[away].id,
                        score1: null,
                        score2: null,
                        status: 'pending', // pending, finished, technical
                        date: matchDate.toISOString().split('T')[0],
                        time: time,
                        events: []
                    });
                }
                sched.push({
                    round: round + 1,
                    matches: roundMatches
                });
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
            if(match.score1 === null || match.score2 === null) {
                return alert("Hisobni kiriting!");
            }
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
            {value: 'goal', label: 'âš½ Gol'},
            {value: 'yellowCard', label: 'ðŸŸ¨ Sariq'},
            {value: 'redCard', label: 'ðŸŸ¥ Qizil'}
        ];
        const teamOptions = computed(() => teams.value.map(t => ({ value: t.id, label: t.name + ' (' + getTeamPlayers(t.id).length + '/10)' })));
        const eventPlayerOptions = computed(() => {
            if(!activeMatchDetails.value) return [];
            return getMatchPlayers(activeMatchDetails.value).map(p => ({ value: p.id, label: '(' + (p.teamType==='home'?'Uy':'Mehmon') + ') ' + p.firstName + ' ' + p.lastName }));
        });
        const eventAssistOptions = computed(() => {
            if(!activeMatchDetails.value) return [];
            return getMatchPlayers(activeMatchDetails.value).map(p => ({ value: p.id, label: p.firstName + ' ' + p.lastName }));
        });
        return {
            currentTab, teamOptions, positionOptions, eventTypeOptions, eventPlayerOptions, eventAssistOptions,
            teams, players, schedule, startDate, generated,
            newTeam, newPlayer,
            addTeam, deleteTeam,
            addPlayer, deletePlayer, getPlayerName, getTeamName, getTeamPlayers,
            generateSchedule, resetSchedule,
            finishMatch, setTechnical, resetMatch,
            activeMatchDetails, openMatchDetails, newEvent, addEvent, removeEvent, getMatchPlayers
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
            <div @click="isOpen = !isOpen" class="input-3d w-full cursor-pointer flex justify-between items-center" :class="{'border-b-2 border-[#008000]': isOpen}">
                <span :class="{'text-gray-400': !modelValue}">{{ selectedLabel || placeholder }}</span>
                <i class="fas fa-chevron-down text-[#008000] transition-transform duration-300" :class="{'rotate-180': isOpen}"></i>
            </div>
            <transition name="fade">
                <div v-if="isOpen" class="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-2xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl overflow-hidden" style="max-height: 250px; overflow-y: auto;">
                    <div v-for="opt in options" :key="opt.value" 
                         @click="selectOption(opt)"
                         class="px-4 py-3 hover:bg-[#008000]/10 cursor-pointer text-gray-800 border-b border-gray-100/50 last:border-0 transition-colors"
                         :class="{'bg-[#008000]/10 font-bold text-[#008000]': modelValue === opt.value}">
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


