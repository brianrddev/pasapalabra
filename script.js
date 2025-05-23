document.addEventListener('DOMContentLoaded', () => {
	// Elementos del DOM
	const roscoContainer = document.getElementById('roscoContainer');
	const questionDisplay = document.getElementById('questionDisplay');
	const currentLetterDisplay = document.getElementById('currentLetterDisplay');
	const answerInput = document.getElementById('answerInput');
	const submitAnswerButton = document.getElementById('submitAnswerButton');
	const pasapalabraButton = document.getElementById('pasapalabraButton');
	const scoreCorrectDisplay = document.getElementById('scoreCorrect');
	const scoreIncorrectDisplay = document.getElementById('scoreIncorrect');
	const timerDisplay = document.getElementById('timerDisplay');

	const configSection = document.getElementById('configSection');
	const gameArea = document.getElementById('gameArea');
	const gameOverScreen = document.getElementById('gameOverScreen');
	const startGameButton = document.getElementById('startGameButton');
	const restartGameButton = document.getElementById('restartGameButton');
	const finalScoreCorrect = document.getElementById('finalScoreCorrect');
	const finalScoreIncorrect = document.getElementById('finalScoreIncorrect');
	const loadingMessage = document.getElementById('loadingMessage');
	const apiKeyInput = document.getElementById('apiKey');
	const apiModelInput = document.getElementById('apiModel');

	const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
	const TOTAL_QUESTIONS = ALPHABET.length;
	const GAME_TIME_SECONDS = 180;

	let roscoData = [];
	let currentLetterIndex = 0;
	let scoreCorrect = 0;
	let scoreIncorrect = 0;
	let questionsAnswered = 0;
	let timerInterval;
	let timeLeft = GAME_TIME_SECONDS;
	let gameActive = false;

	// NUEVA FUNCIÓN: Obtener todas las preguntas de una sola vez
	async function fetchRoscoFromOpenAI(apiKey, model) {
		const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
		const prompt = `
			Genera un objeto JSON con una entrada por cada letra del abecedario español (de la A a la Z, incluyendo la Ñ), usando letras en minúscula como claves.

			Cada entrada debe contener:
			- Una "pregunta": debe ser una pista o definición breve y clara, en español, cuya **respuesta sea coherente** con ella.
			- Una "respuesta": debe ser **una sola palabra en español** que comience **exactamente** por la letra correspondiente.

			⚠️ Reglas obligatorias:
			1. La "respuesta" debe comenzar por la misma letra que la clave.
			2. La "pregunta" debe ser coherente y adecuada a esa "respuesta".
			3. Todas las palabras deben estar en español. No uses términos en inglés como "kid", "watermelon", etc.
			4. Si no puedes generar una entrada válida para una letra, escribe:
			{
				"pregunta": "No disponible.",
				"respuesta": "sin respuesta"
			}

			Formato exacto esperado (solo JSON):
			{
			"a": { "pregunta": "Ave rapaz muy común en España.", "respuesta": "águila" },
			"b": { "pregunta": "Fruta amarilla y alargada.", "respuesta": "banana" },
			...
			"z": { "pregunta": "Animal rayado que vive en África.", "respuesta": "cebra" }
			}

			Devuelve únicamente el objeto JSON, sin ningún texto antes o después.
			`;

		try {
			const response = await fetch(OPENAI_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages: [{ role: 'user', content: prompt }],
					temperature: 0.7,
					max_tokens: 1800,
				}),
			});
			const data = await response.json();
			const content = data.choices[0].message.content;

			// 🔍 Mostrar el contenido recibido en consola
			console.log('📦 JSON recibido desde OpenAI:\n', content);

			// 🔄 Intentar parsear el contenido como JSON
			return JSON.parse(content);
		} catch (err) {
			console.error('❌ Error al obtener o parsear el rosco:', err);
			throw err;
		}
	}

	async function initializeGame() {
		resetGameVariables();
		roscoContainer.innerHTML = '';
		roscoData = [];
		gameActive = true;

		configSection.style.display = 'none';
		gameOverScreen.style.display = 'none';
		gameArea.style.display = 'flex';

		const useOpenAI = apiKeyInput.value.trim() !== '';
		const apiKey = apiKeyInput.value.trim();
		const model = apiModelInput.value.trim() || 'gpt-3.5-turbo';

		if (useOpenAI) {
			loadingMessage.style.display = 'block';
			questionDisplay.textContent = 'Generando preguntas con IA...';
			try {
				const roscoJSON = await fetchRoscoFromOpenAI(apiKey, model);
				ALPHABET.forEach((letter) => {
					const entrada = roscoJSON[letter.toLowerCase()];
					const pregunta = entrada?.pregunta || `(Falta pregunta para ${letter})`;
					const respuesta = entrada?.respuesta?.toLowerCase() || 'error';
					roscoData.push({
						letter,
						question: pregunta,
						answer: respuesta,
						status: 'pending',
						element: null,
					});
				});
			} catch {
				alert('Error al generar preguntas con IA; usando preguntas de ejemplo.');
				await loadSampleQuestions();
			}
			loadingMessage.style.display = 'none';
		} else {
			await loadSampleQuestions();
		}

		setupRoscoVisuals();
		currentLetterIndex = 0;
		displayCurrentQuestion();
		startTimer();
		answerInput.focus();
	}

	async function loadSampleQuestions() {
		const sampleData = [
			{ letter: 'A', question: 'Empieza por A: Sentimiento de vivo afecto…', answer: 'amor' },
			{ letter: 'B', question: 'Empieza por B: Zapato que cubre el pie…', answer: 'bota' },
			// … resto de ejemplo …
		];
		ALPHABET.forEach((L) => {
			const found = sampleData.find((q) => q.letter === L);
			roscoData.push({
				letter: L,
				question: found?.question || `(Ejemplo) Comienza por ${L}: definición.`,
				answer: found?.answer || `respuesta${L.toLowerCase()}`,
				status: 'pending',
				element: null,
			});
		});
	}

	function resetGameVariables() {
		currentLetterIndex = 0;
		scoreCorrect = 0;
		scoreIncorrect = 0;
		questionsAnswered = 0;
		timeLeft = GAME_TIME_SECONDS;
		gameActive = false;
		if (timerInterval) clearInterval(timerInterval);
		updateScoreDisplay();
	}

	function setupRoscoVisuals() {
		const diameter = roscoContainer.offsetWidth;
		const radius = diameter / 2 - 1;
		const centerX = diameter / 2;
		const centerY = roscoContainer.offsetHeight / 2;
		roscoContainer.innerHTML = '';

		ALPHABET.forEach((letter, idx) => {
			const angle = (idx / TOTAL_QUESTIONS) * 2 * Math.PI - Math.PI / 2;
			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);

			const el = document.createElement('div');
			el.classList.add('letter-circle', 'pending');
			el.textContent = letter;
			el.style.left = `${x}px`;
			el.style.top = `${y}px`;

			roscoContainer.appendChild(el);
			roscoData[idx].element = el;
		});
	}

	function displayCurrentQuestion() {
		if (!gameActive || questionsAnswered >= TOTAL_QUESTIONS * 2) {
			endGame('Todas las preguntas respondidas o pasadas dos veces.');
			return;
		}
		const data = roscoData[currentLetterIndex];
		roscoData.forEach((d) => d.element.classList.remove('current'));
		data.element.classList.add('current');

		let prefix = `Comienza por ${data.letter}:`;
		if (data.question.toLowerCase().includes('contiene la') || data.question.toLowerCase().includes(`empieza por ${data.letter.toLowerCase()}`)) {
			prefix = '';
		}
		questionDisplay.textContent = data.question;
		currentLetterDisplay.textContent = prefix;
		answerInput.value = '';
		answerInput.focus();
	}

	function normalizeAnswer(ans) {
		return ans
			.toLowerCase()
			.trim()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	function handleSubmit() {
		if (!gameActive) return;
		const data = roscoData[currentLetterIndex];
		const userAns = normalizeAnswer(answerInput.value);
		const correctAns = normalizeAnswer(data.answer);

		if (userAns === correctAns) {
			data.status = 'correct';
			scoreCorrect++;
		} else {
			data.status = 'incorrect';
			scoreIncorrect++;
		}
		data.element.className = `letter-circle ${data.status}`;
		questionsAnswered++;
		updateScoreDisplay();
		moveToNextQuestion();
	}

	function handlePasapalabra() {
		if (!gameActive) return;
		const data = roscoData[currentLetterIndex];
		if (data.status === 'pending' || data.status === 'pasapalabra') {
			data.status = 'pasapalabra';
			data.element.className = `letter-circle ${data.status}`;
			questionsAnswered++;
		}
		moveToNextQuestion();
	}

	function moveToNextQuestion() {
		let tries = 0;
		do {
			currentLetterIndex = (currentLetterIndex + 1) % TOTAL_QUESTIONS;
			tries++;
			if (tries > TOTAL_QUESTIONS * 2) break;
		} while (['correct', 'incorrect'].includes(roscoData[currentLetterIndex].status));
		if (!roscoData.some((q) => ['pending', 'pasapalabra'].includes(q.status))) {
			endGame('No quedan preguntas pendientes o pasapalabra.');
			return;
		}
		displayCurrentQuestion();
	}

	function updateScoreDisplay() {
		scoreCorrectDisplay.textContent = scoreCorrect;
		scoreIncorrectDisplay.textContent = scoreIncorrect;
	}

	function startTimer() {
		timeLeft = GAME_TIME_SECONDS;
		updateTimerDisplay();
		timerInterval = setInterval(() => {
			timeLeft--;
			updateTimerDisplay();
			if (timeLeft <= 0) {
				clearInterval(timerInterval);
				endGame('¡Tiempo agotado!');
			}
		}, 1000);
	}

	function updateTimerDisplay() {
		const m = Math.floor(timeLeft / 60);
		const s = timeLeft % 60;
		timerDisplay.textContent = `Tiempo: ${m}:${s < 10 ? '0' : ''}${s}`;
	}

	function endGame(reason) {
		console.log('Juego terminado:', reason);
		gameActive = false;
		if (timerInterval) clearInterval(timerInterval);
		const curr = roscoData[currentLetterIndex];
		if (curr && curr.element) curr.element.classList.remove('current');
		finalScoreCorrect.textContent = scoreCorrect;
		finalScoreIncorrect.textContent = scoreIncorrect;
		gameArea.style.display = 'none';
		gameOverScreen.style.display = 'block';
	}

	// Event Listeners
	startGameButton.addEventListener('click', initializeGame);
	restartGameButton.addEventListener('click', () => {
		gameOverScreen.style.display = 'none';
		configSection.style.display = 'block';
	});
	submitAnswerButton.addEventListener('click', handleSubmit);
	pasapalabraButton.addEventListener('click', handlePasapalabra);
	answerInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') handleSubmit();
	});
});
