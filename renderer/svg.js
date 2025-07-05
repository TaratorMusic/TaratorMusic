// svg.js

const icon = {
	customise: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-file-settings" width="45" height="37"
        viewBox="0 -10 50 50" stroke-width="1.5" stroke="#597e8d" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"
        fill="none"/> <path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M12 10.5v1.5" /> <path d="M12 16v1.5" /> <path d="M15.031 12.25l-1.299 .75" />
        <path d="M10.268 15l-1.3 .75" /> <path d="M15 15.803l-1.285 -.773" /> <path d="M10.285 12.97l-1.285 -.773" /> <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /> </svg>`,

	addToPlaylist: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-playlist-add" width="45" height="37"
        viewBox="0 -10 50 50" stroke-width="1.5" stroke="#597e8d" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z"
        fill="none"/> <path d="M19 8h-14" /> <path d="M5 12h9" /> <path d="M11 16h-6" /> <path d="M15 16h6" /> <path d="M18 13v6" /> </svg>`,

	greenAutoplay: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-autofit-right"
        width="20" height="20" viewBox="0 0 24 24" stroke-width="1.5" stroke="#00b341" fill="none" stroke-linecap="round" 
        stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/> <path d="M20 12v-6a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v8" />
        <path d="M4 18h17" /> <path d="M18 15l3 3l-3 3" /> </svg>`,

	redAutoplay: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-autofit-right"
        width="20" height="20" viewBox="0 0 24 24" stroke-width="1.5" stroke="#ff2825" fill="none" stroke-linecap="round"
        stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/> <path d="M20 12v-6a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v8" />
        <path d="M4 18h17" /> <path d="M18 15l3 3l-3 3" /> </svg>`,

	greenShuffle: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrows-shuffle-2"
        width="20" height="20" viewBox="0 0 24 24" stroke-width="1.5" stroke="#00b341" fill="none" stroke-linecap="round"
        stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/> <path d="M18 4l3 3l-3 3" /> <path d="M18 20l3 -3l-3 -3" />
        <path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5" /> <path d="M3 17h3a5 5 0 0 0 5 -5a5 5 0 0 1 5 -5h5" /> </svg>`,

	redShuffle: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrows-shuffle-2"
        width="20" height="20" viewBox="0 0 24 24" stroke-width="1.5" stroke="#ff2825" fill="none" stroke-linecap="round" 
        stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/> <path d="M18 4l3 3l-3 3" /> <path d="M18 20l3 -3l-3 -3" /> 
        <path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5" /> <path d="M3 17h3a5 5 0 0 0 5 -5a5 5 0 0 1 5 -5h5" /> </svg>`,

	greenLoop: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-repeat" width="20" height="20" viewBox="0 0 24 24"
        stroke-width="1.5" stroke="#00b341" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/> <path d="M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3" />
        <path d="M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3" /> </svg>`,

	redLoop: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-repeat" width="20" height="20" viewBox="0 0 24 24"
        stroke-width="1.5" stroke="#ff2825" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/> <path d="M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3" />
        <path d="M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3" /> </svg>`,

	backward: ` <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-rewind-backward-5" width="20" height="20"
        viewBox="0 0 24 24" stroke-width="1.5" stroke="#009988" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/> <path d="M15 18a6 6 0 1 0 0 -12h-11" fill="none"/>
        <path d="M7 9l-3 -3l3 -3" fill="none"/> <path d="M8 20h2a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-2v-3h3" fill="none"/> </svg>`,

	previous: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-player-skip-back-filled" width="20" height="20"
        viewBox="0 0 24 24" stroke-width="1.5" stroke="#00abfb" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none"
        d="M0 0h24v24H0z" fill="none"/> <path d="M19.496 4.136l-12 7a1 1 0 0 0 0 1.728l12 7a1 1 0 0 0 1.504 -.864v-14a1 1 0 0 0 -1.504 -.864z"
        stroke-width="0" fill="currentColor" /> <path d="M4 4a1 1 0 0 1 .993 .883l.007 .117v14a1 1 0 0 1 -1.993 .117l-.007 -.117v-14a1 1 0 0 1 1 -1z"
        stroke-width="0" fill="currentColor" /> </svg>`,

	play: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-player-play-filled" width="20" height="20" viewBox="0 0 24 24"
        stroke-width="1.5" stroke="#7bc62d" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" stroke-width="0" fill="turquoise"/> </svg>`,

	pause: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-player-pause-filled" width="20" height="20" viewBox="0 0 24 24"
        stroke-width="1.5" stroke="#7bc62d" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" stroke-width="0" fill="orangered"/> 
        <path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" stroke-width="0" fill="orangered"/> </svg>`,

	next: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-player-skip-forward-filled" width="20" height="20" viewBox="0 0 24 24"
        stroke-width="1.5" stroke="#00abfb" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="#333"/>
        <path d="M3 5v14a1 1 0 0 0 1.504 .864l12 -7a1 1 0 0 0 0 -1.728l-12 -7a1 1 0 0 0 -1.504 .864z" stroke-width="0" fill="currentColor" />
        <path d="M20 4a1 1 0 0 1 .993 .883l.007 .117v14a1 1 0 0 1 -1.993 .117l-.007 -.117v-14a1 1 0 0 1 1 -1z" stroke-width="0" fill="currentColor" /> </svg>`,

	forward: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-rewind-forward-5" width="20" height="20" viewBox="0 0 24 24"
        stroke-width="1.5" stroke="#009988" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M9 18a6 6 0 1 1 0 -12h11" fill="none"/> <path d="M13 20h2a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-2v-3h3" fill="none"/>
        <path d="M17 9l3 -3l-3 -3" fill="none"/> </svg>`,

	mute: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-volume-3" width="20" height="20" viewBox="0 0 24 24" stroke-width="1.5"
        stroke="#ff9300" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5" /> 
        <path d="M16 10l4 4m0 -4l-4 4" /> </svg>`,

	speed: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-brand-speedtest" width="20" height="20" viewBox="0 0 24 24"
        stroke-width="1.5" stroke="#ff9300" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M5.636 19.364a9 9 0 1 1 12.728 0" /> <path d="M16 9l-4 4" /> </svg>`,

	trash: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-trash-filled" width="100" height="100" viewBox="0 0 24 24" stroke-width="1.5"
        stroke="#ff9300" fill="#ff9300" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/> <path d="M20 6a1 1 0 0 1
        .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117
        -1.993l.117 -.007h16z" stroke-width="0" fill="#ff9300" /> <path d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993
        -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z" stroke-width="0" fill="#ff9300" /> </svg>`,

	custom: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-table-options" width="100" height="100" viewBox="0 0 24 24"
        stroke-width="1.5" stroke="#ff9300" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"/> 
        <path d="M12 21h-7a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v7" /> <path d="M3 10h18" /> <path d="M10 3v18" /> 
        <path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M19.001 15.5v1.5" /> <path d="M19.001 21v1.5" /> <path d="M22.032 17.25l-1.299 .75" />
        <path d="M17.27 20l-1.3 .75" /> <path d="M15.97 17.25l1.3 .75" /> <path d="M20.733 20l1.3 .75" /> </svg>`,

	adjustments: `<svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        stroke-width="1"
        stroke-linecap="round"
        stroke-linejoin="round"
        >
        <path d="M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
        <path d="M4 6l8 0" />
        <path d="M16 6l4 0" />
        <path d="M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
        <path d="M4 12l2 0" />
        <path d="M10 12l10 0" />
        <path d="M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
        <path d="M4 18l11 0" />
        <path d="M19 18l1 0" />
        </svg>
        `,
};

module.exports = icon;
