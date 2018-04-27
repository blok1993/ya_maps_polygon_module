var REGIONS_DATA = {
        region: {
            title: 'Регион',
            items: [{
                id: '001',
                title: 'Страны мира'
            }, {
                id: 'BY',
                title: 'Беларусь'
            }, {
                id: 'KZ',
                title: 'Казахстан'
            }, {
                id: 'RU',
                title: 'Россия'
            }, {
                id: 'TR',
                title: 'Турция'
            }, {
                id: 'UA',
                title: 'Украина'
            }]
        },
        lang: {
            title: 'Язык',
            items: [{
                id: 'en',
                title: 'Английский'
            }, {
                id: 'be',
                title: 'Белорусский'
            }, {
                id: 'kk',
                title: 'Казахский'
            }, {
                id: 'ru',
                title: 'Русский'
            }, {
                id: 'tr',
                title: 'Турецкий'
            }, {
                id: 'uk',
                title: 'Украинский'
            }]
        },
        quality: {
            title: 'Точность границ',
            items: [{
                id: '0',
                title: '0'
            }, {
                id: '1',
                title: '1'
            }, {
                id: '2',
                title: '2'
            }, {
                id: '3',
                title: '3'
            }]
        }
    },
    // Шаблон html-содержимого макета.
    optionsTemplate = [
        '<div style="line-height: 34px; background-color: #80808080;" id="regions-params">',
        '{% for paramName, param in data.params %}',
        '{% for key, value in state.values %}',
        '{% if key == paramName %}',
        '<div class="btn-group btn-group-xs">',
        '<button{% if state.enabled %}{% else %} disabled{% endif %} type="button" class="btn btn-primary dropdown-toggle" data-toggle="dropdown">',
        '<span>{{ param.title }}</span>',
        '<span class="value">: {{ value }}</span>',
        '&nbsp;<span class="caret"></span>',
        '</button>',
        '<ul class="dropdown-menu {{ paramName }}">',
        '{% for item in param.items %}',
        '<li{% if item.id == value %} class="active"{% endif %}>',
        '<a id="regions" href="#" data-param="{{ paramName }}" data-id="{{ item.id }}">',
        '{{ item.title }}',
        '</a>',
        '</li>',
        '{% endfor %}',
        '</ul>',
        '</div>&nbsp;',
        '{% endif %}',
        '{% endfor %}',
        '{% endfor %}',
        '</div>'
    ].join('');

ymaps.ready(init);

// Метод трассировки луча.
// Не работает надежно, когда точка является углом многоугольника или края.
function notAccurateRayCast(point, vs) {
    var x = point[0], y = point[1];

    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];

        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

var classifyPoint = require("robust-point-in-polygon");

function init() {
    // Создадим собственный макет RegionControl.
    var RegionControlLayout = ymaps.templateLayoutFactory.createClass(optionsTemplate, {
            build: function () {
                RegionControlLayout.superclass.build.call(this);
                this.handleClick = ymaps.util.bind(this.handleClick, this);
                $(this.getParentElement)
                    .on('click', 'a#regions', this.handleClick);
            },
            clear: function () {
                $(this.getParentElement)
                    .off('click', 'a#regions', this.handleClick);
                RegionControlLayout.superclass.clear.call(this);
            },
            handleClick: function (e) {
                e.preventDefault();
                var $target = $(e.currentTarget);
                var state = this.getData().state;
                var newValues = ymaps.util.extend({}, state.get('values'));
                if (!$target.hasClass('active')) {
                    newValues[$target.data('param')] = $target.data('id');
                    state.set('values', newValues);
                }
            }
        }),
        // Наследуем класс нашего контрола от ymaps.control.Button.
        RegionControl = ymaps.util.defineClass(function (parameters) {
            RegionControl.superclass.constructor.call(this, parameters);
        }, ymaps.control.Button, /** @lends ymaps.control.Button */{
            onAddToMap: function (map) {
                RegionControl.superclass.onAddToMap.call(this, map);
                this.setupStateMonitor();
                this.loadRegions(this.state.get('values'));
            },

            onRemoveFromMap: function (map) {
                map.geoObjects.remove(this.regions);
                this.clearStateMonitor();
                RegionControl.superclass.onRemoveFromMap.call(this, map);
            },

            setupStateMonitor: function () {
                this.stateMonitor = new ymaps.Monitor(this.state);
                this.stateMonitor.add('values', this.handleStateChange, this);
            },

            clearStateMonitor: function () {
                this.stateMonitor.removeAll();
            },

            handleStateChange: function (params) {
                this.loadRegions(params);
            },

            handleRegionsLoaded: function (res) {
                if(this.regions){
                    map.geoObjects.remove(this.regions);
                }

                //Создание градиента для легенды
                jQuery('.legend-gradient').css('background', 'linear-gradient(to bottom, rgba(100, 0, 100, 1), rgba(255, 150, 100, 1))');

                //Проверка принадлежности точки полигону
                var t0 = performance.now();

                var myPolygon = new ymaps.geometry.Polygon(res.features[0].geometry.coordinates);
                var polygonCreationTime = performance.now() - t0;
                console.log('Время создания полигона ' + polygonCreationTime.toFixed(2) + ' ms');

                var contains = false;
                var numberOfPoints = 1200;
                var numberOfPolygons = res.features.length;

                myPolygon.options.setParent(map.options);
                myPolygon.setMap(map);

                // Данную часть можно улучшить по производительности примерно в 2 раза.
                for (var i = 0; i < numberOfPolygons * numberOfPoints; i++) {
                    // Алгоритм Яндекса (~1.5 sec при 100 000 итерациях)
                    //contains = myPolygon.contains([53.347238, 83.765470]);

                    // Метод трассировки луча (без учета граничных случаев). (~200 ms при 100 000 итерациях)
                    //contains = notAccurateRayCast([53.347238, 83.765470], res.features[0].geometry.coordinates[0]);

                    // Улучшенный, точный метод трассировки луча. (~270 ms при 100 000 итерациях) (~1 sec при 500 000 итерациях) (~2.2 sec при 1млн. итераций)
                    contains = classifyPoint(res.features[0].geometry.coordinates[0], [53.347238, 83.765470]);
                }

                var scriptTime = performance.now() - t0;

                console.log('Кол-во полигонов ' + numberOfPolygons);
                console.log('Кол-во точек ' + numberOfPoints);
                console.log('Время работы скрипта ' + scriptTime.toFixed(2) + ' ms');
                //*//

                this.regions = new ymaps.ObjectManager();
                this.regions
                    .add(res.features.map(function (feature, i) {


                        feature.options = {fillColor: "rgba(" + (100 + i * 2) + ", " + (i * 2) + ", 100, 0.8)"};


                        feature.id = feature.properties.iso3166;
                        return feature;
                    }));

                map.geoObjects.add(this.regions);
                this.getMap().setBounds(
                    this.regions.getBounds(),
                    {checkZoomRange: true}
                );
            },

            loadRegions: function (params) {
                this.disable();
                return ymaps.borders.load(params.region, params)
                    .then(this.handleRegionsLoaded, this)
                    .always(this.enable, this);
            }
        }),

        map = new ymaps.Map('map', {
            center: [50, 30],
            zoom: 3,
            controls: ['typeSelector']
        }, {
            typeSelectorSize: 'small'
        }),

        // Создадим экземпляр RegionControl.
        regionControl = new RegionControl({
            state: {
                enabled: true,
                values: {
                    region: 'RU',
                    lang: 'ru',
                    quality: '1'
                }
            },
            data: {
                params: REGIONS_DATA
            },
            options: {
                layout: RegionControlLayout
            },
            float: 'left',
            maxWidth: [300]
        });

    // Добавим контрол на карту.
    map.controls.add(regionControl);
    // Узнавать о изменениях параметров RegionControl можно следующим образом.
    regionControl.events.add('statechange', function (e) {
        console.log(e.get('target').get('values'));
    });
}