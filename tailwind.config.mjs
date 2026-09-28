/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    /* Palette « Forêt » — le lin, le mélèze, la forêt de pins à la nuit
       tombée, le miel et la lavande de Haute-Provence. Les noms de jetons
       sont hérités du gabarit d'origine et gardés tels quels : toutes les
       pages suivent la palette sans qu'on touche à leur balisage. `bronze`
       est donc ici le bois, `azur` la sauge, `bougain` la lavande. */
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      bone: '#F3EEE2',        // fond principal — lin écru
      paper: '#FAF7EF',       // surfaces claires
      sand: '#E6DCC6',        // bandes alternées — bois blond
      ink: '#1C2A20',         // vert forêt profond — texte et sections sombres
      graphite: '#34463A',
      /* Les tons de texte sont calés sur le seuil AA (4.5:1) mesuré contre
         `bone` ET `sand`, les deux fonds sur lesquels ils vivent : un gris
         choisi à l'œil passe presque toujours sous la barre. */
      muted: '#4F5E50',       // texte secondaire — 5.9:1 sur bone, 5.1:1 sur sand
      faint: '#58665A',       // texte tertiaire — 5.2:1 sur bone, 4.5:1 sur sand
      hair: '#D3C6AA',        // filets sur fond clair
      'hair-dk': '#34473A',   // filets sur fond sombre
      bronze: '#85502A',      // le bois de mélèze — accent sur fond clair, 5.7:1 sur bone
      'bronze-dk': '#6C411C',
      /* Le même accent ne peut pas servir sur les deux fonds : le bois sombre
         tombe sous 3:1 sur la forêt. Version miel pour les sections encre —
         6.9:1. */
      'bronze-lt': '#D8A765',
      azur: '#B7C7A3',        // sauge — filets et accents sur la forêt
      bougain: '#76588F',     // accent rare — la lavande, 5.1:1 sur bone
      /* Les deux couleurs du logo. Couleurs d'identité — le logo les porte
         déjà dans ses pixels ; ces jetons servent à les rappeler ailleurs. */
      gold: '#E6C590',
      'nuit-logo': '#1C2A20',
    },
    fontFamily: {
      /* Serif de lecture à axe optique pour titres et texte, anglaise pour
         l'accent manuscrit, grotesque pour l'interface. */
      serif: ['Newsreader', 'Georgia', 'serif'],
      script: ['Pinyon Script', 'Snell Roundhand', 'cursive'],
      sans: ['Switzer', 'system-ui', 'sans-serif'],
    },
    extend: {
      maxWidth: { prose: '64ch' },
      letterSpacing: { tightest: '-0.03em', tighter2: '-0.022em', label: '0.18em', wide2: '0.26em' },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22,1,0.36,1)',
        editorial: 'cubic-bezier(0.16,1,0.3,1)',
        /* Sortie exponentielle : le départ est franc, l'arrêt très long.
           C'est elle qui donne du poids aux grandes surfaces en mouvement. */
        expo: 'cubic-bezier(0.19,1,0.22,1)',
        soft: 'cubic-bezier(0.445,0.05,0.55,0.95)',
      },
      transitionDuration: { 600: '600ms', 800: '800ms', 1000: '1000ms', 1200: '1200ms' },
      borderRadius: { arch: '50% 50% 0 0 / 38% 38% 0 0' },
    },
  },
  plugins: [],
};
