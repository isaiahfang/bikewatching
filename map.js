import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiaWZhbmciLCJhIjoiY203anhzaXo4MGQwaDJscHhzMHEzcmVieSJ9.W_xHLPtfCxXNK9PhHZ5qzw';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

const svg = d3.select('#map').select('svg');

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
}

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function computeStationTraffic(stations, trips) {
    // Compute departures
    const departures = d3.rollup(
        trips, 
        (v) => v.length, 
        (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id,
    );
  
    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
  });
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

map.on('load', async () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': '#32D400',
            'line-width': 3,
            'line-opacity': 0.4
        }
    });

    let jsonData;
    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
        
        // Await JSON fetch
        const jsonData = await d3.json(jsonurl);

        let trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                return trip;
            },
        );

        const stations = computeStationTraffic(jsonData.data.stations, trips);

        function filterTripsbyTime(trips, timeFilter) {
            return timeFilter === -1 
                ? trips
                : trips.filter((trip) => {
                    const startedMinutes = minutesSinceMidnight(trip.started_at);
                    const endedMinutes = minutesSinceMidnight(trip.ended_at);
                    
                    return (
                        Math.abs(startedMinutes - timeFilter) <= 60 ||
                        Math.abs(endedMinutes - timeFilter) <= 60
                );
            });
        }

        const radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);

        const circles = svg.selectAll('circle')
            .data(stations)
            .enter()
            .append('circle')
            .attr('r', (d) => radiusScale(d.totalTraffic))  // Circle radius
            .attr('fill', 'steelblue')  // Circle fill color
            .attr('stroke', 'white')    // Circle border color
            .attr('stroke-width', 1)    // Circle border thickness
            .attr('opacity', 0.8)      // Circle opacity
            .each(function(d) {
                // Add <title> for browser tooltips
                d3.select(this)
                  .append('title')
                  .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
            });
    
        function updatePositions() {
            circles
                .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
                .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
        }
        
        // Initial position update when map loads
        updatePositions();

        // Reposition markers on map interactions
        map.on('move', updatePositions);     // Update during map movement
        map.on('zoom', updatePositions);     // Update during zooming
        map.on('resize', updatePositions);   // Update on window resize
        map.on('moveend', updatePositions);  // Final adjustment after movement ends

        const timeSlider = document.getElementById('time-slider');
        const selectedTime = document.getElementById('selected-time');
        const anyTimeLabel = document.getElementById('any-time');
        
        function updateTimeDisplay() {
            let timeFilter = Number(timeSlider.value);
        
            if (timeFilter === -1) {
              selectedTime.textContent = '';
              anyTimeLabel.style.display = 'block';
            } else {
              selectedTime.textContent = formatTime(timeFilter);
              anyTimeLabel.style.display = 'none';
            }
            
            updateScatterPlot(timeFilter);
        }

        function updateScatterPlot(timeFilter) {
            const filteredTrips = filterTripsbyTime(trips, timeFilter);
            
            const filteredStations = computeStationTraffic(stations, filteredTrips);

            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
            
            circles
                .data(filteredStations, (d) => d.short_name)
                .join('circle')
                .attr('r', (d) => radiusScale(d.totalTraffic));
        }

        timeSlider.addEventListener('input', updateTimeDisplay);
        updateTimeDisplay();

    } catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
    }
});


