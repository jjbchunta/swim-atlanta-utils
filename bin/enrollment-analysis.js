const fs = require('fs');
const csv = require('csv-parser');

// Ensure a file path is provided from the command line.
if (process.argv.length < 3) {
    console.error('Usage: node script.js <absolute/path/to/file.csv>');
    process.exit(1);
}

const argFilePath = process.argv[2];

let totalEnrollmentRows = 0;
let enrollmentsAfterFirstWeekOfSession = 0;

/**
 * Define a promise based helper function for reading a .csv file.
 * 
 * @param {*} filePath 
 * @param {*} onRow 
 * @param {*} onComplete 
 * @returns 
 */
async function readCSVFile(filePath, onRow, onComplete = () => {}) {
    return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
            onRow(row);
        })
        .on('end', () => {
            onComplete();
            resolve();
        })
        .on('error', (error) => {
            reject(error);
        });
    });
}

const monthNames = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12,
};
const monthNameStrings = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/**
 * An amalgamation of the days where classes exist.
 */
const sessionDays = {};

/**
 * A list of sessions that have been specifically marked to ignore.
 */
let blacklistedSessions = [];

/**
 * Check if a specific session name has been marked as one to ignore.
 * 
 * @param {*} sessionStr 
 * @returns 
 */
function isBlacklisted(sessionStr) {
    return blacklistedSessions.includes(sessionStr);
}

/**
 * Log the existance of a class on a specific day at a specific month on a
 * specific year.
 * 
 * @param {*} year 
 * @param {*} month 
 * @param {*} day 
 */
function addSessionDay(year, month, day) {
    const key = `${year}-${month}`;
    if (!sessionDays[key]) {
        sessionDays[key] = new Set();
    }
    sessionDays[key].add(day);
}

/**
 * Gets the first day of a month of a specific year that classes first start.
 * 
 * @param {*} month 
 * @param {*} year 
 * @returns 
 */
function getFirstClassDay(month, year) {
    const key = `${year}-${month}`;
    if (!sessionDays[key] || sessionDays[key].size === 0) return null;
    const days = Array.from(sessionDays[key]);
    days.sort((a, b) => a - b);
    return days[0];
}

/**
 * Function to parse the "Session" column, by extracting the text within parentheses and
 * tokenizes it.
 * 
 * @param {*} sessionStr 
 * @param {*} enrollYear 
 * @param {*} enrollMonth 
 * @returns 
 */
function parseSessionDates(sessionStr, enrollYear, enrollMonth) {
    // Extract text within parentheses.
    const match = sessionStr.match(/\(([^)]+)\)/);
    if (!match) return [];
    const inner = match[1].trim();
  
    // Tokenize inner text by splitting on spaces and periods.
    const tokens = inner.split(/[ .]+/).filter(token => token.trim() !== '');
  
    // Check for special session pattern:
    // Exactly 5 tokens where the first is a valid month and the remaining 4 are day numbers.
    if (tokens.length === 5 && monthNames[tokens[0]]) {
        const dayNumbers = tokens.slice(1).map(token => parseInt(token, 10));
        if (dayNumbers.every(num => !isNaN(num))) {
            // Verify that the day numbers are consecutive.
            let isConsecutive = true;
            for (let i = 1; i < dayNumbers.length; i++) {
                if (dayNumbers[i] !== dayNumbers[i - 1] + 1) {
                    isConsecutive = false;
                    break;
                }
            }
            if (isConsecutive) {
                // If not already in the blacklist, add this session string.
                if (!blacklistedSessions.includes(sessionStr)) {
                    blacklistedSessions.push(sessionStr);
                }
                // Exclude special sessions from further processing.
                return [];
            }
        }
    }
  
    // Normal session parsing:
    let currentMonth = null;
    const dates = [];
    
    tokens.forEach(token => {
        // Update currentMonth if token is a month name.
        if (monthNames[token]) {
            currentMonth = monthNames[token];
        } else {
            // Otherwise, treat token as a day number.
            const day = parseInt(token, 10);
            if (!isNaN(day) && currentMonth !== null) {
                // Determine the session year: if the enrollMonth is greater than the session's month, the session falls in the next year.
                let sessionYear = enrollYear;
                if (enrollMonth > currentMonth) {
                    sessionYear = enrollYear + 1;
                }
                dates.push({ year: sessionYear, month: currentMonth, day: day });
            }
        }
    });
    
    return dates;
}

// Primary execution lifecycle.
(async() => {
    // Compile the days of the year(s) where classes happen.
    await readCSVFile(argFilePath,
        (row) => {
            const enrollDateStr = row['Enroll Date'];
            const sessionStr = row['Session'];
            if (!enrollDateStr || !sessionStr) return;
            
            // Parse the enrollment date (assuming MM/DD/YYYY format).
            const enrollParts = enrollDateStr.split('/');
            if (enrollParts.length !== 3) return;
            const enrollMonth = parseInt(enrollParts[0], 10);
            const enrollYear = parseInt(enrollParts[2], 10);
            if (isNaN(enrollMonth) || isNaN(enrollYear)) return;
            
            // Parse the session dates from the session string.
            const dates = parseSessionDates(sessionStr, enrollYear, enrollMonth);
            dates.forEach(({ year, month, day }) => {
                addSessionDay(year, month, day);
            });
        }
    );
    
    // Go on to compile the number of enrollments made after the first week of the session.
    await readCSVFile(argFilePath,
        (row) => {
            totalEnrollmentRows++;
    
            // Expecting columns "Enroll Date" and "Session"
            const enrollDateStr = row['Enroll Date'];
            const sessionStr = row['Session'];

            // If this is a blacklisted session, ignore it
            if (isBlacklisted(sessionStr)) {
                return;
            }
            
            // Only proceed if both columns exist.
            if (!enrollDateStr || !sessionStr) return;
            
            // Parse the enrollment date (assumes MM/DD/YYYY)
            const dateParts = enrollDateStr.split('/');
            if (dateParts.length !== 3) return;
            
            const month = parseInt(dateParts[0], 10);
            const day = parseInt(dateParts[1], 10);
            let year = parseInt(dateParts[2], 10);
            
            // Validate the parsed numbers.
            if (isNaN(month) || isNaN(day)) return;
            
            // Convert month number to month name.
            const enrollMonthName = monthNameStrings[month];
            
            // Check if the "Session" column contains the enrollment month (case insensitive).
            if (!sessionStr.toLowerCase().startsWith(enrollMonthName.toLowerCase())) {
                // Skip this row if the month doesn't match the session title.
                return;
            }

            // Estimate the year of the session
            const sessionMonthIndex = monthNames[enrollMonthName];
            if (month > sessionMonthIndex) {
                year++;
            }
            
            // Increment the counter if the enrollment day is after the first week
            const firstWeekThreshold = getFirstClassDay(month, year) + 7;
            if (day > firstWeekThreshold) {
                // console.log(enrollDateStr, "-", sessionStr, "-", firstWeekThreshold);
                enrollmentsAfterFirstWeekOfSession++;
            }
        },
        () => {
            const factor = `${enrollmentsAfterFirstWeekOfSession} / ${totalEnrollmentRows}`;
            const decimal = enrollmentsAfterFirstWeekOfSession / totalEnrollmentRows * 100;
            console.log(`Enrollments after the first week of session: ${factor} (${decimal}%)`);
        }
    );
})();