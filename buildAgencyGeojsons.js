import { joinFeatureCollections } from './utils.js'

import {
  getCalendarDates,
  getRoutes,
  getStops,
  getStoptimes,
  getTrips,
} from 'gtfs'

export const buildAgencyGeojsonsPerRoute = (agency) => {
  const routes = getRoutes({ agency_id: agency.agency_id })

  const featureCollections = routes
    /*
    .filter(
      (route) =>
        route.route_id === 'FR:Line::D6BAEC78-815E-4C9A-BC66-2B9D2C00E41F:'
    )
	*/
    .filter(({ route_short_name }) => route_short_name.match(/^\d.+/g))
    .map((route) => {
      const trips = getTrips({ route_id: route.route_id })
      //console.log(trips.slice(0, 2), trips.length)

      const features = trips.map((trip) => {
        const { trip_id } = trip
        const stopTimes = getStoptimes({ trip_id })

        const coordinates = stopTimes.map(({ stop_id }) => {
          const stops = getStops({ stop_id })
          if (stops.length > 1)
            throw new Error('One stoptime should correspond to only one stop')

          const { stop_lat, stop_lon } = stops[0]
          console.log(stops[0])
          return [stop_lon, stop_lat]
        })

        const dates = getCalendarDates({ service_id: trip.service_id })

        const properties = rejectNullValues({ ...route, ...trip, dates })

        const feature = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties,
        }
        //beautiful, but not really useful I'm afraid...
        //return bezierSpline(feature)
        return feature
      })

      /* Very simple and potentially erroneous way to avoid straight lines that don't show stops where the trains don't stop.
       * Not effective : lots of straight lines persist through routes that cross France*/
      const mostStops = features.reduce(
        (memo, next) => {
          const memoNum = memo.geometry.coordinates.length,
            nextNum = next.geometry.coordinates.length
          return memoNum > nextNum ? memo : next
        },
        { geometry: { coordinates: [] } }
      )

      return {
        type: 'FeatureCollection',
        features,
        //bezierSpline(mostStops),
        //mostStops,
      }
    })

  return joinFeatureCollections(featureCollections)
}

export const buildAgencyGeojsonsPerWeightedSegment = (agency) => {
  const routes = getRoutes({ agency_id: agency.agency_id })

  const segmentMap = new Map()
  const segmentCoordinatesMap = new Map()
  const featureCollections = routes
    /*
    .filter(
      (route) =>
        route.route_id === 'FR:Line::D6BAEC78-815E-4C9A-BC66-2B9D2C00E41F:'
    )
	*/
    // What's that ?
    //    .filter(({ route_short_name }) => route_short_name.match(/^\d.+/g))
    .forEach((route) => {
      const trips = getTrips({ route_id: route.route_id })

      trips.forEach((trip) => {
        const { trip_id } = trip
        const stopTimes = getStoptimes({ trip_id })

        const points = stopTimes.map(({ stop_id }) => {
          const stops = getStops({ stop_id })
          if (stops.length > 1)
            throw new Error('One stoptime should correspond to only one stop')

          const { stop_lat, stop_lon, stop_name } = stops[0]
          const coordinates = [stop_lon, stop_lat]
          if (!segmentCoordinatesMap.has(stop_id))
            segmentCoordinatesMap.set(stop_id, coordinates)
          return {
            coordinates,
            stop: { id: stop_id, name: stop_name },
          }
        })

        const dates = getCalendarDates({ service_id: trip.service_id })

        const segments = points
          .map(
            (point, index) =>
              index > 0 && [
                point.stop.id + ' -> ' + points[index - 1].stop.id,
                { count: dates.length, tripId: trip_id },
              ]
          )
          .filter(Boolean)

        segments.forEach(([segmentKey, trip]) => {
          const current = segmentMap.get(segmentKey) || {
            count: 0,
            tripIds: [],
          }

          const newTrip = {
            count: current.count + trip.count,
            tripIds: [...current.tripIds, trip.tripId],
          }
          segmentMap.set(segmentKey, newTrip)
        })

        /*
        const properties = rejectNullValues({ ...route, ...trip, dates })

        const feature = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties,
        }
		*/
        //beautiful, but not really useful I'm afraid...
        //return bezierSpline(feature)
        //return feature
      })
    }, {})

  const segmentEntries = [...segmentMap.entries()]

  const lines = segmentEntries.map(([segmentId, properties]) => {
    const [a, b] = segmentId.split(' -> ')
    const pointA = segmentCoordinatesMap.get(a),
      pointB = segmentCoordinatesMap.get(b)
    return {
      geometry: { type: 'LineString', coordinates: [pointA, pointB] },
      properties,
      type: 'Feature',
    }
  })

  const points = [...segmentCoordinatesMap.entries()].map(([id, value]) => ({
    type: 'Feature',
    properties: {
      stopId: id,
      count: segmentEntries
        .filter(([k]) => k.includes(id))
        .reduce((memo, next) => memo + next[1], 0),
    },
    geometry: {
      type: 'Point',
      coordinates: value,
    },
  }))

  console.log('POINTS', points)
  return { type: 'FeatureCollection', features: [...lines, ...points] }
  return joinFeatureCollections(featureCollections)
}
