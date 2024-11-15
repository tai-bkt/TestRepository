let map;
let directionsService;
let directionsRenderer;

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 39.507, lng: -84.745 },
        zoom: 13
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);
}

// Call the initMap function
initMap();

// Add event listener for file input
document.getElementById('excelFileInput').addEventListener('change', handleFile);

// Handle file reading and parsing
async function handleFile(event) {
    const file = event.target.files[0];

    if (!file) {
        console.error('No file selected');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        const courses = await getActiveCanvasCourses();

        const buttonContainer = document.getElementById('courseButtons');
        buttonContainer.innerHTML = '';

        const courseButtons = new Map();

        excelData.slice(1).forEach(row => {
            const [ , courseSubjectCode, courseNumber, courseSection, , , , , , courseBuilding, room] = row;

            const sectionIDs = expandSectionRange(courseSection);
            if (isCourseActive(courses, courseSubjectCode, courseNumber, sectionIDs)) {
                const courseKey = `${courseSubjectCode}-${courseNumber}`;

                // Ensure only one button is created per course
                if (!courseButtons.has(courseKey)) {
                    const button = document.createElement('button');
                    button.innerText = `${courseSubjectCode} ${courseNumber} - ${courseSection} (Room ${room})`;
                    button.onclick = () => plotCourseAndDirections(courseBuilding); // Initialize directions on button click

                    courseButtons.set(courseKey, button);
                    buttonContainer.appendChild(button);
                }
            }
        });
    };

    reader.readAsArrayBuffer(file);
}

// Function to fetch active Canvas courses from the local server
async function getActiveCanvasCourses() {
    const response = await fetch('http://localhost:3000/api/courses');
    const courses = await response.json();

    return courses.map(course => {
        if (course.course_code && typeof course.course_code === 'string') {
            const match = course.course_code.match(/^([A-Za-z/]+)(\d+)(?:\s+([A-Za-z]+(?:-[A-Za-z])?))?$/);

            if (match) {
                const subjectCodes = match[1].split('/');
                const courseNumber = match[2];
                const section = match[3] || '';

                const sectionIDs = section.includes('-') ? expandSectionRange(section) : [section];

                return {
                    subjectCodes,
                    courseNumber,
                    sectionIDs
                };
            } else {
                console.warn('Course code is malformed:', course.course_code);
                return null;
            }
        } else {
            console.warn('Course code is missing or malformed:', course);
            return null;
        }
    }).filter(course => course !== null);
}

// Helper function to expand section ranges
function expandSectionRange(sectionRange) {
    sectionRange = sectionRange.trim();
    if (sectionRange.includes('-')) {
        const [start, end] = sectionRange.split('-').map(s => s.toUpperCase());
        const sections = [];
        for (let i = start.charCodeAt(0); i <= end.charCodeAt(0); i++) {
            sections.push(String.fromCharCode(i));
        }
        return sections;
    } else {
        return [sectionRange.toUpperCase()];
    }
}

// Check if course from Excel matches any active Canvas courses
function isCourseActive(courses, subjectCode, courseNumber, excelSectionIDs) {
    return courses.some(course =>
        course.subjectCodes.some(code => code.toLowerCase() === subjectCode.toLowerCase()) &&
        course.courseNumber === courseNumber &&
        excelSectionIDs.some(excelSectionID => course.sectionIDs.includes(excelSectionID))
    );
}

// Plot course location based on building name and initialize directions
function plotCourseAndDirections(building) {
    const service = new google.maps.places.PlacesService(map);

    // Check for specific buildings and use the updated locations
    let query = building.trim();

    switch (query.toLowerCase()) {
        case 'art building':
            query = 'Arts Building, 400 S Patterson Ave, Oxford, OH 45056';
            break;
        case 'engineering building':
            query = 'Garland Hall';
            break;
        case 'psychology building':
            query = '90 N. Patterson Avenue, Oxford, OH 45056';
            break;
        default:
            // For other buildings, use the original query
            query = `${query} Campus, Oxford`;
            break;
    }

    service.findPlaceFromQuery({
        query: query,
        fields: ['name', 'geometry']
    }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
            const location = results[0].geometry.location;

            // Add a marker for the building location on the map
            const marker = new google.maps.Marker({
                position: location,
                map: map,
                title: building,  // Show only the building name in the marker's title
            });

            // Center the map on the marker
            map.setCenter(location);

            // Initialize directions when the button is pressed
            getUserLocationAndDirections(location);
        } else {
            console.warn(`No place found for building: ${query}`);
        }
    });
}

function getUserLocationAndDirections(courseLocation) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log("User location fetched:", userLocation);
                calculateRoute(userLocation, courseLocation);
            },
            (error) => {
                console.error('Error fetching location:', error);
                console.log('Error code:', error.code);
                console.log('Error message:', error.message);
                
                // Use default location if geolocation fails
                const defaultLocation = { lat: 39.507, lng: -84.745 };
                console.log('Using default location:', defaultLocation);
                calculateRoute(defaultLocation, courseLocation); 
            },
            {
                enableHighAccuracy: true,   // Try to get high-accuracy location
                timeout: 10000,             // Timeout after 10 seconds
                maximumAge: 0               // Avoid using cached location
            }
        );
    } else {
        console.error('Geolocation is not supported by this browser');
        // Use default location if geolocation is not supported
        const defaultLocation = { lat: 39.507, lng: -84.745 };
        console.log('Using default location (geolocation not supported):', defaultLocation);
        calculateRoute(defaultLocation, courseLocation); 
    }
}

// Calculate and display route to the course location
function calculateRoute(start, end) {
    const request = {
        origin: start,
        destination: end,
        travelMode: google.maps.TravelMode.WALKING
    };

    directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
        } else {
            console.error('Directions request failed due to ' + status);
        }
    });
}