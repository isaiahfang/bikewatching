import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiaWZhbmciLCJhIjoiY203anhzaXo4MGQwaDJscHhzMHEzcmVieSJ9.W_xHLPtfCxXNK9PhHZ5qzw';

let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterByMinute(tripsByMinute, minute) {
    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;

    if (minMinute > maxMinute) {
        let beforeMidnight = tripsByMinute.slice(minMinute);
        let afterMidnight = tripsByMinute.slice(0, maxMinute);
        return beforeMidnight.concat(afterMidnight).flat();
    } else {
        return tripsByMinute.slice(minMinute, maxMinute).flat();
    }
}

const map = new mapboxgl.Map({
    container: "map",
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
});

map.on("load", () => {
    const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
    const csvurl = "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";

    d3.json(jsonurl)
        .then((jsonData) => {
        d3.csv(csvurl).then(function (data) {
            const trips = data;
            const stations = jsonData.data.stations;

            let timeFilter = -1;

            const radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([3, 15]);

            const svg = d3.select("#map").select("svg");

            const tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

            const circles = svg
            .selectAll("circle")
            .data(stations)
            .enter()
            .append("circle")
            .attr("r", (d) => radiusScale(d.totalTraffic))
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .attr("opacity", 0.8)
            .style("--departure-ratio", (d) =>
                d.totalTraffic === 0
                ? 0.5
                : stationFlow(d.departures / d.totalTraffic)
            )
            .on("mouseover", function (event, d) {
                tooltip.transition().duration(200).style("opacity", 0.9);
                tooltip
                .html(
                    `${d.totalTraffic} trips<br>(${d.departures} departures, ${d.arrivals} arrivals)`
                )
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY - 28 + "px");
            })
            .on("mouseout", function (d) {
                tooltip.transition().duration(500).style("opacity", 0);
            });

            function updateVisualization() {
            const radiusScale = d3
                .scaleSqrt()
                .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
                .range(timeFilter === -1 ? [3, 15] : [3, 25]);

            circles
                .data(filteredStations)
                .transition()
                .duration(100)
                .attr("r", (d) => radiusScale(d.totalTraffic))
                .style("--departure-ratio", (d) =>
                d.totalTraffic === 0
                    ? 0.5
                    : stationFlow(d.departures / d.totalTraffic)
                );
            }

            trips.forEach((trip) => {
            const startedMinutes = minutesSinceMidnight(
                new Date(trip.started_at)
            );
            const endedMinutes = minutesSinceMidnight(new Date(trip.ended_at));

            departuresByMinute[startedMinutes].push(trip);
            arrivalsByMinute[endedMinutes].push(trip);
            });

            function filterTripsbyTime() {
            if (timeFilter === -1) {
                filteredArrivals = d3.rollup(
                trips,
                (v) => v.length,
                (d) => d.end_station_id
                );

                filteredDepartures = d3.rollup(
                trips,
                (v) => v.length,
                (d) => d.start_station_id
                );
            } else {
                const filteredDepartureTrips = filterByMinute(
                departuresByMinute,
                timeFilter
                );
                const filteredArrivalTrips = filterByMinute(
                arrivalsByMinute,
                timeFilter
                );

                filteredDepartures = d3.rollup(
                filteredDepartureTrips,
                (v) => v.length,
                (d) => d.start_station_id
                );

                filteredArrivals = d3.rollup(
                filteredArrivalTrips,
                (v) => v.length,
                (d) => d.end_station_id
                );
            }

            filteredStations = stations.map((station) => ({
                ...station,
                arrivals: filteredArrivals.get(station.short_name) ?? 0,
                departures: filteredDepartures.get(station.short_name) ?? 0,
                totalTraffic:
                (filteredArrivals.get(station.short_name) ?? 0) +
                (filteredDepartures.get(station.short_name) ?? 0),
            }));

            updateVisualization();
            }

            filterTripsbyTime();

            d3.select("#time-slider").on("input", function () {
            timeFilter = +this.value;
            if (timeFilter === -1) {
                d3.select("#any-time").style("display", "block");
                d3.select("#selected-time").style("display", "none");
            } else {
                const hours = Math.floor(timeFilter / 60);
                const minutes = timeFilter % 60;
                d3.select("#selected-time")
                .text(
                    `${hours.toString().padStart(2, "0")}:${minutes
                    .toString()
                    .padStart(2, "0")}`
                )
                .style("display", "block");
                d3.select("#any-time").style("display", "none");
            }
            filterTripsbyTime();
            });

            function getCoords(station) {
            const point = new mapboxgl.LngLat(+station.lon, +station.lat);
            const { x, y } = map.project(point);
            return { cx: x, cy: y };
            }

            function updatePositions() {
            circles
                .attr("cx", (d) => getCoords(d).cx)
                .attr("cy", (d) => getCoords(d).cy);
            }

            updatePositions();


            map.on("move", updatePositions);
            map.on("zoom", updatePositions);
            map.on("resize", updatePositions);
            map.on("moveend", updatePositions);
        });
    })
    .catch((error) => {
      console.error("Error loading JSON:", error);
    });
});