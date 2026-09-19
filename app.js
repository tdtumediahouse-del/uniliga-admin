const { createApp } = Vue;

createApp({
    data() {
        return {
            currentTab: 'matches',
            teams: [
                { id: 1, name: 'Lochinlar' },
                { id: 2, name: 'Yuristlar' },
                { id: 3, name: 'Iqtisodchilar' },
                { id: 4, name: 'IT-Fayz' },
                { id: 5, name: 'Tibbiyot' },
                { id: 6, name: 'Pedagoglar' },
                { id: 7, name: 'Bokschi' },
                { id: 8, name: 'Buxgalter' },
                { id: 9, name: 'Filolog' },
                { id: 10, name: 'Arxitektor' }
            ],
            matches: [],
            scorers: [],
            newMatch: { team1: '', team2: '', score1: '', score2: '', isTechnical: false },
            newScorer: { name: '', team: '', goals: 1 }
        }
    },
    computed: {
        totalGoals() {
            return this.matches.reduce((sum, match) => sum + match.score1 + match.score2, 0);
        },
        standings() {
            let table = this.teams.map(t => ({
                id: t.id, name: t.name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0
            }));

            this.matches.forEach(m => {
                let t1 = table.find(t => t.id === m.team1);
                let t2 = table.find(t => t.id === m.team2);
                
                if(!t1 || !t2) return;
                
                t1.played++; t2.played++;
                t1.gf += m.score1; t1.ga += m.score2;
                t2.gf += m.score2; t2.ga += m.score1;

                if (m.score1 > m.score2) {
                    t1.won++; t1.points += 3;
                    t2.lost++;
                } else if (m.score1 < m.score2) {
                    t2.won++; t2.points += 3;
                    t1.lost++;
                } else {
                    t1.drawn++; t2.drawn++;
                    t1.points += 1; t2.points += 1;
                }
            });

            return table.sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points; 
                if ((b.gf - b.ga) !== (a.gf - a.ga)) return (b.gf - b.ga) - (a.gf - a.ga); 
                return b.gf - a.gf;
            });
        },
        sortedScorers() {
            return [...this.scorers].sort((a, b) => b.goals - a.goals);
        }
    },
    methods: {
        getTeamName(id) {
            let team = this.teams.find(t => t.id === id);
            return team ? team.name : 'Noma\'lum';
        },
        addMatch() {
            if (!this.newMatch.team1 || !this.newMatch.team2 || this.newMatch.team1 === this.newMatch.team2) {
                alert("Iltimos, har xil bo'lgan ikkita jamoani tanlang!"); return;
            }
            if (this.newMatch.score1 === '' || this.newMatch.score2 === '') {
                alert("Hisobni to'liq kiriting!"); return;
            }
            
            this.matches.push({
                team1: this.newMatch.team1,
                team2: this.newMatch.team2,
                score1: parseInt(this.newMatch.score1),
                score2: parseInt(this.newMatch.score2),
                isTechnical: this.newMatch.isTechnical
            });
            
            this.saveData();
            this.newMatch = { team1: '', team2: '', score1: '', score2: '', isTechnical: false };
        },
        deleteMatch(index) {
            if(confirm("Haqiqatan ham bu o'yin natijasini o'chirmoqchimisiz?")) {
                this.matches.splice(index, 1);
                this.saveData();
            }
        },
        addGoals() {
            if (!this.newScorer.name || !this.newScorer.team || !this.newScorer.goals) {
                alert("O'yinchi ismi, jamoasi va gollar sonini to'liq kiriting!"); return;
            }
            
            let existing = this.scorers.find(s => s.name === this.newScorer.name && s.team === this.newScorer.team);
            if (existing) {
                existing.goals += parseInt(this.newScorer.goals);
            } else {
                this.scorers.push({
                    id: Date.now(),
                    name: this.newScorer.name,
                    team: this.newScorer.team,
                    goals: parseInt(this.newScorer.goals)
                });
            }
            this.saveData();
            this.newScorer.name = '';
            this.newScorer.goals = 1;
        },
        deleteScorer(id) {
            if(confirm("Haqiqatan ham o'yinchini ro'yxatdan o'chirmoqchimisiz?")) {
                this.scorers = this.scorers.filter(s => s.id !== id);
                this.saveData();
            }
        },
        
        // API orqali ma'lumot jo'natish simulyatsiyasi (Netlify ga o'tganda shu joy API ga ulanadi)
        async saveData() {
            try {
                // Hozircha mahalliy xotiraga yozamiz
                localStorage.setItem('eduliga_matches_pro', JSON.stringify(this.matches));
                localStorage.setItem('eduliga_scorers_pro', JSON.stringify(this.scorers));
                
                // KELAJAKDA: fetch('API_URL/matches', { method: 'POST', body: ... })
                
            } catch (error) {
                console.error("Saqlashda xatolik:", error);
            }
        },
        async loadData() {
            try {
                let m = localStorage.getItem('eduliga_matches_pro');
                let s = localStorage.getItem('eduliga_scorers_pro');
                if (m) this.matches = JSON.parse(m);
                if (s) this.scorers = JSON.parse(s);
            } catch (error) {
                console.error("Yuklashda xatolik:", error);
            }
        }
    },
    mounted() {
        this.loadData();
    }
}).mount('#app');
