const MODEL_URL = './models'
const API_URL = "https://alpomish-fitness.uz/"
let faceMatcher = null
let userDataMap = new Map()
let successAudio, errorAudio, warningAudio
let detectionBox = null
let faceInBoxStartTime = null
const FACE_DETECTION_DURATION = 1000  // 2 sekund

const MIN_FACE_SIZE = 100 // Minimal yuz o'lchami (pikselda)
let currentCameraIndex = 0 // Joriy kamera indeksi
let availableCameras = [] // Mavjud kameralar ro'yxati

function loadAudioElements() {
    successAudio = document.getElementById('successAudio')
    warningAudio = document.getElementById('warningAudio')
    errorAudio = document.getElementById('errorAudio')
}

function playAudio(isSuccess) {
    if (isSuccess == 1) {
        successAudio.play()
    } if (isSuccess == 2) {
        successAudio.play()
    } if (isSuccess == 3) {
        warningAudio.play()
    } if (isSuccess == 4) {
        errorAudio.play()
    }
}

function updateUI(status, message) {
    const statusElement = document.getElementById('status')

    console.log(status)


    if (status == 1) {
        statusElement.innerHTML = `
            <div class="wrap-result">
                <img src="./public/img/success.svg" alt="Success" width="300" height="300">
                
                <div class="success-user">${message}</div>
            </div>
        `

    } else if (status == 2) {
        statusElement.innerHTML = `
        <div class="wrap-result">
            <img src="./public/img/success.svg" alt="Success" width="300" height="300">
            
            <div class="success-user">${message}</div>
        </div>
    `
    } else if (status == 3) {
        statusElement.innerHTML = `
        <div class="wrap-result">
            <img src="./public/img/warning.svg" alt="Success" width="300" height="300">
            
            <div class="warning-user">${message}</div>
        </div>
    `
    } else {
        statusElement.innerHTML = `
            <div class="wrap-result">
                <img src="./public/img/error.svg" alt="Error" width="500" height="400">
            </div>
        `
    }

    playAudio(status)

    setTimeout(() => {
        statusElement.innerHTML = `

        `
        statusElement.className = ''
    }, 10000)
}

async function loadModels() {
    console.log('Modellar yuklanmoqda...')
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        console.log('Barcha modellar muvaffaqiyatli yuklandi')
    } catch (err) {
        console.error('Modellarni yuklashda xatolik:', err)
        throw err
    }
}

async function fetchReferenceData() {
    try {
        const response = await fetch(`${API_URL}api/all-users/`)
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        console.log('API dan olingan ma\'lumotlar:', data)

        data.forEach(user => {
            if (user.avatar && typeof user.avatar === 'string') {
                user.avatar = user.avatar.startsWith('http') ? user.avatar : `${API_URL}${user.avatar.replace(/^\//, '')}`
            } else {
                user.avatar = null
            }
            userDataMap.set(user.first_name, user)
        })

        return data
    } catch (err) {
        console.error('API dan ma\'lumot olishda xatolik:', err)
        return []
    }
}

async function loadReferenceImages() {
    console.log('Reference rasmlar yuklanmoqda...')
    try {
        const referenceData = await fetchReferenceData()
        if (referenceData.length === 0) {
            throw new Error('Reference ma\'lumotlar topilmadi')
        }
        const labeledDescriptors = await Promise.all(
            referenceData.map(async (person) => {
                if (!person.avatar) {
                    console.warn(`${person.first_name} uchun avatar yo'q`)
                    return null
                }
                try {
                    return await loadImageAndGetDescriptor(person.avatar, person.first_name)
                } catch (err) {
                    console.warn(`${person.first_name} uchun deskriptor olib bo'lmadi:`, err)
                    return null
                }
            })
        )

        const validDescriptors = labeledDescriptors.filter(desc => desc !== null)
        if (validDescriptors.length === 0) {
            throw new Error('Hech qanday yaroqli deskriptor topilmadi')
        }

        faceMatcher = new faceapi.FaceMatcher(validDescriptors)
        console.log('Reference rasmlar muvaffaqiyatli yuklandi va FaceMatcher yaratildi')
    } catch (err) {
        console.error('Reference rasmlarni yuklashda xatolik:', err)
    }
}

async function loadImageAndGetDescriptor(imageUrl, label) {
    try {
        console.log(`${label} uchun yuklanayotgan rasm URL:`, imageUrl)
        const img = await faceapi.fetchImage(imageUrl)
        const detections = await faceapi.detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor()
        if (!detections) {
            throw new Error(`${label} uchun yuzni aniqlab bo'lmadi`)
        }
        return new faceapi.LabeledFaceDescriptors(label, [detections.descriptor])
    } catch (err) {
        console.error(`${label} uchun deskriptor olishda xatolik:`, err)
        throw err
    }
}

async function startVideo() {
    const video = document.getElementById('video')
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        })
        video.srcObject = stream
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve(video)
            }
        })
    } catch (err) {
        console.error('Kamera xatosi:', err)
        alert('Kamerani ulashda xatolik yuz berdi. Iltimos, kamera ruxsatlarini tekshiring va qayta urining.')
        throw err
    }
}

function isFullyInsideBox(face, box) {
    return (
        face.x >= box.x &&
        face.y >= box.y &&
        face.x + face.width <= box.x + box.width &&
        face.y + face.height <= box.y + box.height
    )
}

async function postDetectedPerson(code) {
    console.log('Yuborilayotgan kod:', code)

    try {
        const response = await fetch('https://alpomish-fitness.uz/api/create-attendance/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code: code })
        })
        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        const result = await response.json()
        console.log('Aniqlangan odam muvaffaqiyatli yuborildi:', result)
        updateUI(result.status, "Xush keldingiz")
        return result.status
    } catch (err) {
        console.error('Aniqlangan odamni yuborishda xatolik:', err)
        updateUI(4, "Yozilmadi")
        return result.status
    }
}

const MATCH_THRESHOLD = 0.7 // 70% o'xshashlik yetarli
const CONSECUTIVE_MATCHES_REQUIRED = 10 // Ketma-ket 10 ta mos kelish
const MATCH_INTERVAL = 200 // Har 200 ms da tekshirish
const FACE_RECOGNITION_PROBABILITY_THRESHOLD = 0.8 // 80% yuz aniqlash ehtimolligi
const DESCRIPTOR_HISTORY_LENGTH = 10 // So'nggi 10 ta deskriptorni saqlash
const POST_COOLDOWN = 2 * 60 * 60 * 1000 // 2 soat
const ERROR_INTERVAL = 10000 // 10 sekund
const PROCESS_INTERVAL = 500 // Har 500 ms da kaderni qayta ishlash

let consecutiveMatches = {}
let lastMatchTimes = {}
let faceDescriptors = {}
let lastSuccessfulPostTimes = {}
let lastErrorTime = 0

function isUserInDatabase(label) {
    return userDataMap.has(label) && userDataMap.get(label).code !== 'API_YOQ'
}

async function startFaceRecognition() {
    console.log('Face recognition boshlanmoqda...')
    try {
        await loadModels()
        await loadReferenceImages()
        const video = await startVideo()

        const canvas = faceapi.createCanvasFromMedia(video)
        const elWrapper = document.getElementById('wrapper')

        elWrapper.append(canvas)
        const displaySize = { width: video.width, height: video.height }
        faceapi.matchDimensions(canvas, displaySize)

        // Kvadratni o'rnatish
        const boxSize = Math.min(displaySize.width, displaySize.height) * 0.6
        const detectionBox = {
            x: (displaySize.width - boxSize) / 2,
            y: (displaySize.height - boxSize) / 2,
            width: boxSize,
            height: boxSize
        }

        let lastProcessedTime = Date.now()

        video.addEventListener('play', () => {
            const loop = async () => {
                const now = Date.now()
                if (now - lastProcessedTime >= PROCESS_INTERVAL) {
                    const detections = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options())
                        .withFaceLandmarks()
                        .withFaceDescriptors()

                    const resizedDetections = faceapi.resizeResults(detections, displaySize)

                    const ctx = canvas.getContext('2d')
                    ctx.clearRect(0, 0, canvas.width, canvas.height)

                    ctx.strokeStyle = '#00a0ea'
                    ctx.lineWidth = 3
                    ctx.strokeRect(detectionBox.x, detectionBox.y, detectionBox.width, detectionBox.height)

                    if (faceMatcher && resizedDetections.length > 0) {
                        lastErrorTime = now

                        for (let detection of resizedDetections) {
                            const box = detection.detection.box

                            // Flip qilingan koordinatalarni hisoblash
                            const flippedBox = {
                                x: canvas.width - box.x - box.width,
                                y: box.y,
                                width: box.width,
                                height: box.height
                            }

                            // Yuz o'lchamini va joylashuvini tekshirish
                            if (flippedBox.width < MIN_FACE_SIZE || flippedBox.height < MIN_FACE_SIZE || !isFullyInsideBox(flippedBox, detectionBox)) {
                                const drawBox = new faceapi.draw.DrawBox(flippedBox, {
                                    label: 'Yaqinroq keling',
                                    boxColor: 'orange'
                                })
                                drawBox.draw(canvas)
                                continue
                            }

                            if (detection.detection.score < FACE_RECOGNITION_PROBABILITY_THRESHOLD) {
                                continue
                            }

                            const match = faceMatcher.findBestMatch(detection.descriptor)

                            if (!faceDescriptors[match.label]) {
                                faceDescriptors[match.label] = []
                            }
                            faceDescriptors[match.label].push(detection.descriptor)
                            if (faceDescriptors[match.label].length > DESCRIPTOR_HISTORY_LENGTH) {
                                faceDescriptors[match.label].shift()
                            }
                            const averageDescriptor = faceDescriptors[match.label].reduce((acc, curr) => acc.map((val, i) => val + curr[i]), new Array(128).fill(0))
                                .map(val => val / faceDescriptors[match.label].length)

                            const averageMatch = faceMatcher.findBestMatch(averageDescriptor)

                            const isInDatabase = isUserInDatabase(match.label)

                            if (averageMatch.distance <= MATCH_THRESHOLD && isInDatabase) {
                                if (!consecutiveMatches[match.label]) {
                                    consecutiveMatches[match.label] = 0
                                }
                                if (!lastMatchTimes[match.label] || now - lastMatchTimes[match.label] >= MATCH_INTERVAL) {
                                    consecutiveMatches[match.label]++
                                    lastMatchTimes[match.label] = now
                                }

                                if (consecutiveMatches[match.label] >= CONSECUTIVE_MATCHES_REQUIRED) {
                                    const userData = userDataMap.get(match.label)
                                    if (userData && userData.code) {
                                        const lastPostTime = lastSuccessfulPostTimes[match.label] || 0
                                        if (now - lastPostTime >= POST_COOLDOWN) {
                                            const status = await postDetectedPerson(userData.code)
                                            console.log(status)

                                            if (status == 1) {
                                                lastSuccessfulPostTimes[match.label] = now
                                                updateUI(1, `Xush keldingiz ${userData.last_name} ${userData.first_name}`)
                                            } else if (status == 2) {
                                                updateUI(2, `Davomat olingan`)
                                            } else if (status == 3) {
                                                updateUI(3, `Balans yetarli emas`)
                                            } else {
                                                updateUI(4, `Mijoz yoq`)
                                            }
                                        }
                                        consecutiveMatches[match.label] = 0
                                        faceDescriptors[match.label] = []
                                    }
                                }
                            } else {
                                consecutiveMatches[match.label] = 0
                            }

                            const matchPercentage = (1 - averageMatch.distance) * 100
                            const lastPostTime = lastSuccessfulPostTimes[match.label] || 0
                            const timeSinceLastPost = now - lastPostTime
                            const canPostAgain = timeSinceLastPost >= POST_COOLDOWN

                            let boxColor = 'green'
                            if (isInDatabase) {
                                if (matchPercentage >= 80) {
                                    boxColor = canPostAgain ? 'green' : 'blue'
                                }
                            } else {
                                boxColor = 'red'
                            }

                            const timeLeft = canPostAgain ? 0 : Math.ceil((POST_COOLDOWN - timeSinceLastPost) / 60000)
                            let label
                            if (isInDatabase) {
                                label = `${match.label} (${matchPercentage.toFixed(0)}%)${!canPostAgain ? ` - ${timeLeft} daqiqa` : ''}`
                            } else {
                                label = 'Foydalanuvchi topilmadi'
                            }

                            const drawBox = new faceapi.draw.DrawBox(flippedBox, { label, boxColor })
                            drawBox.draw(canvas)
                        }
                    }
                    lastProcessedTime = now
                }
                requestAnimationFrame(loop)
            }
            loop()
        })

        console.log('Face recognition muvaffaqiyatli boshlandi')
    } catch (err) {
        console.error('Face recognition boshlashda xatolik:', err)
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadAudioElements()
    startFaceRecognition()
})

console.log('Script yuklandi')